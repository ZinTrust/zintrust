/**
 * Worker PING — wake + drain trigger.
 *
 * Producer side (`triggerWorkerPing`): called after a job is enqueued (and by cron). It
 * wakes the worker runtime so jobs are drained promptly instead of waiting for the next
 * cron tick.
 *
 * - Monolith / same isolate (no `WORKER_PING_URL`): start the local drain loop directly
 *   via the background scheduler (`ctx.waitUntil`).
 * - Split service (`WORKER_PING_URL` set): POST to the worker service's PING endpoint.
 *
 * `WAIT_FOR_PING` gates the producer: when `true` the producer awaits the PING *ack only*
 * (worker-awake confirmation), never the job's completion; when false it is fire-and-forget.
 *
 * Endpoint side (`handlePing`): authenticates, schedules the drain loop on the background
 * scheduler, and responds immediately with an awake ack. The concurrent-PING guard lives in
 * `ensureDraining`, so overlapping pings never start duplicate loops.
 */

import { Env } from '@config/env';
import { Logger } from '@config/logger';
import { BackgroundTaskScheduler } from '@runtime/BackgroundTaskScheduler';
import { ensureDraining, isDraining, type AppWorkerDefinition } from '@worker-runtime/drain';
import type { WorkerModule } from '@worker-runtime/processor-registry';
import { isRedisRpcConfigured } from '@worker-runtime/rpc-client';

type PingRequest = {
  getHeader?: (name: string) => string | string[] | undefined;
};

type PingResponse = {
  json: (body: unknown) => unknown;
  setStatus: (status: number) => PingResponse;
};

const getPingSecret = (): string =>
  Env.get(
    'WORKER_PING_SECRET',
    Env.get('REDIS_RPC_SECRET', Env.get('REDIS_PROXY_SECRET', Env.get('APP_KEY', '')))
  ).trim();

const headerValue = (req: PingRequest, name: string): string => {
  const raw = req.getHeader?.(name);
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === 'string' ? value.trim() : '';
};

/**
 * Producer-side wake. Safe no-op when the worker runtime is disabled/unconfigured.
 *
 * `appWorkerDefinitions` / `workerModules` are the app's bundled worker manifest and
 * statically-imported processor modules; they are only used in the same-isolate branch to
 * start the local drain loop. In the split-service branch the wake is a remote PING and the
 * worker service supplies its own definitions, so they are unused there.
 */
export const triggerWorkerPing = async (
  appWorkerDefinitions: AppWorkerDefinition[],
  workerModules: ReadonlyArray<WorkerModule>
): Promise<void> => {
  if (!Env.getBool('WORKER_ENABLED', false) || !isRedisRpcConfigured()) {
    return;
  }
  const url = Env.get('WORKER_PING_URL', '').trim();

  if (url.length === 0) {
    // Same isolate: wake the local drain loop in the background.
    BackgroundTaskScheduler.schedule(ensureDraining(appWorkerDefinitions, workerModules));
    return;
  }

  const secret = getPingSecret();
  const ack = fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(secret ? { 'x-worker-ping-secret': secret } : {}),
    },
    body: JSON.stringify({ at: new Date().toISOString() }),
  })
    .then(() => undefined)
    .catch((error) => {
      Logger.warn('[worker-runtime] worker ping failed', error);
    });

  if (Env.getBool('WAIT_FOR_PING', false)) {
    await ack; // wait for the awake ack only — never the job's completion
  } else {
    BackgroundTaskScheduler.schedule(ack);
  }
};

/** Endpoint-side handler: authenticate, start draining in the background, ack immediately. */
export const handlePing = (
  req: PingRequest,
  res: PingResponse,
  appWorkerDefinitions: AppWorkerDefinition[],
  workerModules: ReadonlyArray<WorkerModule>
): void => {
  const expected = getPingSecret();
  if (expected.length > 0 && headerValue(req, 'x-worker-ping-secret') !== expected) {
    res.setStatus(401).json({ ok: false, error: 'Invalid worker ping secret' });
    return;
  }
  if (!Env.getBool('WORKER_ENABLED', false) || !isRedisRpcConfigured()) {
    res.json({ ok: true, status: 'disabled' });
    return;
  }
  const alreadyDraining = isDraining();
  BackgroundTaskScheduler.schedule(ensureDraining(appWorkerDefinitions, workerModules));
  res.json({ ok: true, status: 'awake', alreadyDraining });
};
