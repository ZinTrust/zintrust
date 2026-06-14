/**
 * Worker drain loop.
 *
 * The Cloudflare Worker is not an always-on daemon, so it does not hold persistent BullMQ
 * consumers. Instead it is woken by a PING (on enqueue, or by cron) and then drains
 * available jobs: pull an atomically-claimed job over HTTP RPC, run the bundled processor,
 * and ack/fail it back over RPC. The whole drain runs inside the Worker so it executes the
 * app's real business logic with all bindings/code already bundled.
 *
 * A single drain loop runs at a time (guard). A PING that arrives while a loop is active is
 * a no-op for the loop (the caller still gets an immediate ack).
 */
import { Env } from '@config/env';
import { Logger } from '@config/logger';
import type { Job } from 'bullmq';

import { isNullish } from '@helper/index';
import type { WorkerModule } from '@worker-runtime/processor-registry';
import { resolveProcessor } from '@worker-runtime/processor-registry';
import {
  ackJob,
  failJob,
  isRedisRpcConfigured,
  listWorkers,
  pullJob,
} from '@worker-runtime/rpc-client';

let activeDrain: Promise<void> | null = null;

const sleep = async (ms: number): Promise<void> =>
  new Promise((resolve) => globalThis.setTimeout(resolve, ms));

const intEnv = (key: string, fallback: number): number => {
  const parsed = Number.parseInt(Env.get(key, '').trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const csvEnvSet = (key: string): Set<string> =>
  new Set(
    Env.get(key, '')
      .split(',')
      .map((value) => value.trim())
      .filter((value) => value.length > 0)
  );

type DrainTarget = {
  queueName: string;
  processorSpec: string;
};

/**
 * Narrow drain targets by env allowlist/denylist:
 * - `WORKER_DRAIN_QUEUES`: if set, only these queues are drained.
 * - `WORKER_DRAIN_EXCLUDE_QUEUES`: these queues are always skipped.
 */
export const filterDrainTargetsByEnv = (targets: DrainTarget[]): DrainTarget[] => {
  const onlyQueues = csvEnvSet('WORKER_DRAIN_QUEUES');
  const excludeQueues = csvEnvSet('WORKER_DRAIN_EXCLUDE_QUEUES');

  return targets.filter((target) => {
    if (onlyQueues.size > 0 && !onlyQueues.has(target.queueName)) {
      return false;
    }

    return !excludeQueues.has(target.queueName);
  });
};

type DrainLoopConfig = Readonly<{
  deadline: number;
  idleSleepMs: number;
  maxIdleCycles: number;
  visibilityTimeoutMs: number;
}>;

export type AppWorkerDefinition = Readonly<{
  name: string;
  queueName: string;
  version: string;
  autoStart: boolean;
  activeStatus: boolean;
  concurrency: number;
  processorSpec: string;
}>;

/**
 * Resolve which queues this Worker should drain: app manifest workers that have a bundled
 * processor and are not disabled. The backend lifecycle registry is authoritative for
 * start/stop — a worker explicitly `stopped` there is skipped; otherwise the manifest's
 * `autoStart` decides.
 */
export const resolveDrainTargets = async (
  appWorkerDefinitions: AppWorkerDefinition[],
  workerModules: ReadonlyArray<WorkerModule>
): Promise<DrainTarget[]> => {
  let statusByQueue = new Map<string, string>();
  try {
    const registered = await listWorkers();
    statusByQueue = new Map(
      registered
        .filter(
          (entry) => typeof entry.queueName === 'string' && entry.source === 'redis-rpc-registry'
        )
        .map((entry) => [entry.queueName, entry.status ?? 'stopped'])
    );
  } catch (error) {
    Logger.debug(
      '[worker-runtime] worker registry unavailable; falling back to manifest autoStart',
      error
    );
  }

  const targets: DrainTarget[] = [];
  for (const definition of appWorkerDefinitions) {
    if (definition.activeStatus === false) continue;
    if (!resolveProcessor(definition.processorSpec, workerModules)) continue;
    const status = statusByQueue.get(definition.queueName);
    const enabled = status === undefined ? definition.autoStart === true : status === 'running';
    if (enabled) {
      targets.push({ queueName: definition.queueName, processorSpec: definition.processorSpec });
    }
  }
  return filterDrainTargetsByEnv(targets);
};

const toJob = (
  queueName: string,
  pulled: { id: string; name?: string; payload: unknown; attempts: number }
): Job => {
  return {
    id: pulled.id,
    name: pulled.name ?? 'default',
    data: pulled.payload,
    queueName,
    attemptsMade: pulled.attempts,
  } as unknown as Job;
};

const getDrainLoopConfig = (): DrainLoopConfig => ({
  deadline: Date.now() + intEnv('WORKER_DRAIN_MAX_MS', 300_000),
  idleSleepMs: intEnv('WORKER_DRAIN_IDLE_SLEEP_MS', 1_000),
  maxIdleCycles: intEnv('WORKER_DRAIN_MAX_IDLE_CYCLES', 5),
  visibilityTimeoutMs: intEnv('WORKER_DRAIN_VISIBILITY_MS', 30_000),
});

/** Pull and process a single job for a queue. Returns true if a job was handled. */
const drainOneJob = async (
  target: DrainTarget,
  visibilityTimeoutMs: number,
  workerModules: ReadonlyArray<WorkerModule>
): Promise<boolean> => {
  const pulled = await pullJob(target.queueName, visibilityTimeoutMs);
  if (!pulled) return false;

  const processor = resolveProcessor(target.processorSpec, workerModules);
  if (!processor) {
    await failJob(target.queueName, pulled.id, `No bundled processor for ${target.processorSpec}`);
    return true;
  }

  try {
    const returnValue = await processor(toJob(target.queueName, pulled));
    await ackJob(target.queueName, pulled.id, returnValue);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    Logger.error('[worker-runtime] job processing failed', {
      queue: target.queueName,
      jobId: pulled.id,
      reason,
    });
    await failJob(target.queueName, pulled.id, reason);
  }
  return true;
};

const drainTargetQueue = async (
  target: DrainTarget,
  visibilityTimeoutMs: number,
  workerModules: ReadonlyArray<WorkerModule>,
  deadline: number
): Promise<number> => {
  let handledCount = 0;

  while (Date.now() < deadline) {
    // eslint-disable-next-line no-await-in-loop
    const handled = await drainOneJob(target, visibilityTimeoutMs, workerModules).catch(
      (error: Error) => {
        Logger.warn('[worker-runtime] drainOneJob error', { queue: target.queueName, error });
        return false;
      }
    );

    if (!handled) break;
    handledCount += 1;
  }

  return handledCount;
};

const drainTargets = async (
  targets: DrainTarget[],
  visibilityTimeoutMs: number,
  workerModules: ReadonlyArray<WorkerModule>,
  deadline: number
): Promise<number> => {
  const handledCounts = await Promise.all(
    targets.map(async (target) =>
      drainTargetQueue(target, visibilityTimeoutMs, workerModules, deadline)
    )
  );

  return handledCounts.reduce((sum, handledCount) => sum + handledCount, 0);
};

const runDrainLoop = async (
  appWorkerDefinitions: AppWorkerDefinition[],
  workerModules: ReadonlyArray<WorkerModule>
): Promise<void> => {
  if (!Env.getBool('WORKER_ENABLED', false) || !isRedisRpcConfigured()) {
    return;
  }

  const { deadline, idleSleepMs, maxIdleCycles, visibilityTimeoutMs } = getDrainLoopConfig();

  let idleCycles = 0;
  while (Date.now() < deadline && idleCycles < maxIdleCycles) {
    // eslint-disable-next-line no-await-in-loop
    const targets = await resolveDrainTargets(appWorkerDefinitions, workerModules);
    if (targets.length === 0) break;

    // eslint-disable-next-line no-await-in-loop
    const handledThisCycle = await drainTargets(
      targets,
      visibilityTimeoutMs,
      workerModules,
      deadline
    );

    if (handledThisCycle === 0) {
      idleCycles += 1;
      // eslint-disable-next-line no-await-in-loop
      await sleep(idleSleepMs);
      continue;
    }

    idleCycles = 0;
  }
};

/**
 * Ensure a drain loop is running. Returns immediately. If a loop is already active this is
 * a no-op (concurrent-PING guard). The returned promise resolves when the active loop ends
 * and is suitable for `ctx.waitUntil`.
 */
export const ensureDraining = async (
  appWorkerDefinitions: AppWorkerDefinition[],
  workerModules: ReadonlyArray<WorkerModule>
): Promise<void> => {
  if (!isNullish(activeDrain)) return activeDrain;
  activeDrain = runDrainLoop(appWorkerDefinitions, workerModules)
    .catch((error) => {
      Logger.error('[worker-runtime] drain loop crashed', error);
    })
    .finally(() => {
      activeDrain = null;
    });
  return activeDrain;
};

export const isDraining = (): boolean => activeDrain !== null;
