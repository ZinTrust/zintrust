/**
 * Queue Work Runner
 *
 * Processes queued jobs via the framework CLI.
 *
 * BullMQ Compatibility:
 * - Works with both basic queue drivers and BullMQ Redis driver
 * - When QUEUE_DRIVER=redis, uses BullMQ enterprise features automatically
 * - No changes needed - uses standard Queue API which is BullMQ-compatible
 */
import type { ReleaseCondition } from '@/types/Queue';
import { Broadcast } from '@broadcast/Broadcast';
import { Env } from '@config/env';
import { Logger } from '@config/logger';
import { queueConfig } from '@config/queue';
import { ErrorFactory } from '@exceptions/ZintrustError';
import { ZintrustLang } from '@lang/lang';
import { Notification } from '@notification/Notification';
import { createLockProvider, getLockProvider, registerLockProvider } from '@queue/LockProvider';
import { Queue } from '@tools/queue/Queue';
import { registerQueuesFromRuntimeConfig } from '@tools/queue/QueueRuntimeRegistration';

export type QueueWorkKind = 'broadcast' | 'notification';

type BroadcastPayload = {
  type?: unknown;
  channel: string;
  event: string;
  data: unknown;
  timestamp?: number;
  attempts?: number;
};

type NotificationPayload = {
  type?: unknown;
  recipient: string;
  message: string;
  options?: Record<string, unknown>;
  timestamp?: number;
  attempts?: number;
};

export type QueueWorkRunnerOptions = {
  queueName: string;
  kind?: QueueWorkKind;
  driverName?: string;
  timeoutSeconds?: number;
  maxItems?: number;
  /** Max retries after the first attempt (so total attempts = retry + 1) */
  retry?: number;
};

export type QueueWorkRunnerResult = {
  processed: number;
  retried: number;
  dropped: number;
  notDueRequeued: number;
  unknown: number;
};

const isKind = (value: unknown): value is QueueWorkKind =>
  value === 'broadcast' || value === 'notification';

const detectKindFromPayload = (payload: unknown): QueueWorkKind | undefined => {
  if (payload !== null && typeof payload === 'object') {
    const p = payload as Record<string, unknown>;
    if (isKind(p['type'])) return p['type'];
    if (typeof p['channel'] === 'string' && typeof p['event'] === 'string') return 'broadcast';
    if (typeof p['recipient'] === 'string' && typeof p['message'] === 'string')
      return 'notification';
  }
  return undefined;
};

const normalizeNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
};

const getTimestamp = (payload: Record<string, unknown>): number | undefined => {
  return normalizeNumber(payload['timestamp']);
};

const getAttempts = (payload: Record<string, unknown>): number => {
  const n = normalizeNumber(payload['attempts']);
  return typeof n === 'number' && n >= 0 ? Math.floor(n) : 0;
};

const withAttempts = (
  payload: Record<string, unknown>,
  attempts: number
): Record<string, unknown> => {
  return { ...payload, attempts };
};

const shouldStop = (startedAtMs: number, timeoutSeconds?: number): boolean => {
  if (timeoutSeconds === undefined) return false;
  const elapsedMs = Date.now() - startedAtMs;
  return elapsedMs >= timeoutSeconds * 1000;
};

type ProcessOutcome = 'continue' | 'break';

const QUEUE_META_KEY = '__zintrustQueueMeta';

type QueueMeta = {
  deduplicationId?: string;
  releaseAfter?: string | number | ReleaseCondition;
  uniqueId?: string;
};

let lockProviderCache: ReturnType<typeof createLockProvider> | null = null;

const getLockProviderForQueue = (): ReturnType<typeof createLockProvider> => {
  if (lockProviderCache) return lockProviderCache;

  const providerName = Env.get('QUEUE_LOCK_PROVIDER', ZintrustLang.REDIS).trim();
  const prefix = Env.get('QUEUE_LOCK_PREFIX', ZintrustLang.ZINTRUST_LOCKS_PREFIX).trim();
  const defaultTtl = Env.getInt('QUEUE_DEFAULT_DEDUP_TTL', ZintrustLang.ZINTRUST_LOCKS_TTL);

  const existing = getLockProvider(providerName);
  if (existing) {
    lockProviderCache = existing;
    return existing;
  }

  const provider = createLockProvider({
    type: providerName === ZintrustLang.REDIS ? ZintrustLang.REDIS : ZintrustLang.MEMORY,
    prefix: prefix.length > 0 ? prefix : ZintrustLang.ZINTRUST_LOCKS_PREFIX,
    defaultTtl,
  });
  registerLockProvider(providerName, provider);
  lockProviderCache = provider;
  return provider;
};

const extractQueueMeta = (
  payload: Record<string, unknown>
): { payload: Record<string, unknown>; meta?: QueueMeta } => {
  const metaValue = payload[QUEUE_META_KEY];
  if (metaValue !== undefined && metaValue !== null && typeof metaValue === 'object') {
    const { [QUEUE_META_KEY]: metaRaw, ...rest } = payload;
    return { payload: rest, meta: metaRaw as QueueMeta };
  }

  return { payload, meta: undefined };
};

const resolveConditionStatus = (condition: string): string | null => {
  const normalized = condition.trim().toLowerCase();
  if (normalized.includes('failed') || normalized.includes('error')) return 'failed';
  if (normalized.includes('success') || normalized.includes('completed')) return 'success';

  // Try to extract explicit comparison like: job.result.status === "completed"
  const match = new RegExp(/status\s*={1,3}\s*['"]([a-z]+)['"]/).exec(normalized);
  const capturedValue = match?.[1];
  if (capturedValue !== null && capturedValue !== undefined && capturedValue.length > 0) {
    const value = capturedValue;
    if (value === 'failed' || value === 'error') return 'failed';
    if (value === 'success' || value === 'completed') return 'success';
  }

  return null;
};

const shouldReleaseForOutcome = (
  releaseAfter: QueueMeta['releaseAfter'],
  outcome: 'success' | 'failed'
): boolean => {
  if (releaseAfter === 'success') return outcome === 'success';
  if (releaseAfter === 'failed') return outcome === 'failed';
  if (typeof releaseAfter === 'string') {
    const normalized = releaseAfter.toLowerCase();
    if (normalized.includes('failed') || normalized.includes('error')) return outcome === 'failed';
    if (normalized.includes('success') || normalized.includes('completed'))
      return outcome === 'success';
    const fromCondition = resolveConditionStatus(normalized);
    return fromCondition !== null && fromCondition === outcome;
  }
  if (releaseAfter !== null && releaseAfter !== undefined && typeof releaseAfter === 'object') {
    const condition = String(releaseAfter.condition ?? '').toLowerCase();
    const fromCondition = resolveConditionStatus(condition);
    return fromCondition !== null && fromCondition === outcome;
  }
  return false;
};

const releaseLockAfterResult = async (
  meta: QueueMeta | undefined,
  outcome: 'success' | 'failed'
): Promise<void> => {
  if (meta === undefined) return;
  const deduplicationId = meta.deduplicationId;
  if (deduplicationId === undefined || deduplicationId === null) {
    return;
  }
  const deduplicationKey = String(deduplicationId).trim();
  if (deduplicationKey === '') return;
  const releaseAfter = meta.releaseAfter;
  if (releaseAfter === undefined || releaseAfter === null || releaseAfter === '') return;
  if (!shouldReleaseForOutcome(releaseAfter, outcome)) return;

  const provider = getLockProviderForQueue();
  const doRelease = async (): Promise<void> => {
    const status = await provider.status(deduplicationKey);
    if (!status.exists) return;
    await provider.release({
      key: deduplicationKey,
      ttl: status.ttl ?? 0,
      acquired: true,
      expires: status.expires ?? new Date(),
    });
  };

  const delay =
    typeof releaseAfter === 'object' && typeof releaseAfter.delay === 'number'
      ? releaseAfter.delay
      : 0;

  if (delay > 0) {
    const timeoutId = globalThis.setTimeout(() => {
      void doRelease();
    }, delay);
    timeoutId.unref();
  } else {
    await doRelease();
  }
};

const processMessage = async (
  options: QueueWorkRunnerOptions,
  msg: { id: string; payload: Record<string, unknown> },
  maxAttempts: number,
  result: QueueWorkRunnerResult
): Promise<ProcessOutcome> => {
  const payload = msg.payload ?? {};
  const { payload: payloadWithoutMeta, meta } = extractQueueMeta(payload);
  const kind = options.kind ?? detectKindFromPayload(payloadWithoutMeta);

  if (kind === undefined) {
    Logger.warn('Queue worker: unknown job payload; dropping', {
      queue: options.queueName,
      messageId: msg.id,
      payloadKeys: Object.keys(payload),
    });
    result.unknown++;
    await Queue.ack(options.queueName, msg.id, options.driverName);
    return 'continue';
  }

  const timestamp = getTimestamp(payloadWithoutMeta);
  if (typeof timestamp === 'number' && timestamp > Date.now()) {
    // Not due yet: re-enqueue and stop after rotating the head once.
    const payloadForRequeue = meta
      ? { ...payloadWithoutMeta, [QUEUE_META_KEY]: meta }
      : payloadWithoutMeta;
    await Queue.enqueue(options.queueName, payloadForRequeue, options.driverName);
    await Queue.ack(options.queueName, msg.id, options.driverName);
    result.notDueRequeued++;
    return 'break';
  }

  const attempts = getAttempts(payloadWithoutMeta);

  try {
    if (kind === 'broadcast') {
      const job = payloadWithoutMeta as unknown as BroadcastPayload;
      await Broadcast.send(job.channel, job.event, job.data);
    } else {
      const job = payloadWithoutMeta as unknown as NotificationPayload;
      await Notification.send(job.recipient, job.message, job.options ?? {});
    }

    await releaseLockAfterResult(meta, 'success');

    await Queue.ack(options.queueName, msg.id, options.driverName);
    result.processed++;
    return 'continue';
  } catch (error) {
    const nextAttempts = attempts + 1;
    const canRetry = nextAttempts < maxAttempts;

    Logger.error('Queue worker: job failed', {
      queue: options.queueName,
      kind,
      messageId: msg.id,
      attempts: nextAttempts,
      maxAttempts,
      error,
    });

    if (canRetry) {
      const payloadForRetry = meta
        ? { ...payloadWithoutMeta, [QUEUE_META_KEY]: meta }
        : payloadWithoutMeta;
      await Queue.enqueue(
        options.queueName,
        withAttempts(payloadForRetry, nextAttempts),
        options.driverName
      );
      result.retried++;
    } else {
      await releaseLockAfterResult(meta, 'failed');
      result.dropped++;
    }

    await Queue.ack(options.queueName, msg.id, options.driverName);
    return 'continue';
  }
};

export const QueueWorkRunner = Object.freeze({
  async run(options: QueueWorkRunnerOptions): Promise<QueueWorkRunnerResult> {
    registerQueuesFromRuntimeConfig(queueConfig);

    const startedAtMs = Date.now();

    const maxItems = typeof options.maxItems === 'number' ? options.maxItems : 1000;
    const timeoutSeconds = typeof options.timeoutSeconds === 'number' ? options.timeoutSeconds : 10;
    const maxRetries = typeof options.retry === 'number' ? options.retry : 3;
    const maxAttempts = Math.max(0, Math.floor(maxRetries)) + 1;

    const result: QueueWorkRunnerResult = {
      processed: 0,
      retried: 0,
      dropped: 0,
      notDueRequeued: 0,
      unknown: 0,
    };

    /* eslint-disable no-await-in-loop */
    while (result.processed < maxItems && !shouldStop(startedAtMs, timeoutSeconds)) {
      const msg = await Queue.dequeue<Record<string, unknown>>(
        options.queueName,
        options.driverName
      );
      if (msg === undefined) break;

      const outcome = await processMessage(
        options,
        { id: msg.id, payload: msg.payload ?? {} },
        maxAttempts,
        result
      );
      if (outcome === 'break') break;
    }
    /* eslint-enable no-await-in-loop */

    return result;
  },

  parseKind(value: unknown): QueueWorkKind {
    const v = String(value ?? '')
      .trim()
      .toLowerCase();
    if (v === 'broadcast' || v === 'broad') return 'broadcast';
    if (v === 'notification' || v === 'notify') return 'notification';
    throw ErrorFactory.createCliError(
      `Invalid kind '${String(value)}'. Expected 'broadcast' or 'notification'.`
    );
  },
});

export default QueueWorkRunner;
