import { Broadcast } from '@broadcast/Broadcast';
import { Logger } from '@config/logger';
import { queueConfig } from '@config/queue';
import { ErrorFactory } from '@exceptions/ZintrustError';
import { Notification } from '@notification/Notification';
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

const processMessage = async (
  options: QueueWorkRunnerOptions,
  msg: { id: string; payload: Record<string, unknown> },
  maxAttempts: number,
  result: QueueWorkRunnerResult
): Promise<ProcessOutcome> => {
  const payload = msg.payload ?? {};
  const kind = options.kind ?? detectKindFromPayload(payload);

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

  const timestamp = getTimestamp(payload);
  if (typeof timestamp === 'number' && timestamp > Date.now()) {
    // Not due yet: re-enqueue and stop after rotating the head once.
    await Queue.enqueue(options.queueName, payload, options.driverName);
    await Queue.ack(options.queueName, msg.id, options.driverName);
    result.notDueRequeued++;
    return 'break';
  }

  const attempts = getAttempts(payload);

  try {
    if (kind === 'broadcast') {
      const job = payload as unknown as BroadcastPayload;
      await Broadcast.send(job.channel, job.event, job.data);
    } else {
      const job = payload as unknown as NotificationPayload;
      await Notification.send(job.recipient, job.message, job.options ?? {});
    }

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
      await Queue.enqueue(
        options.queueName,
        withAttempts(payload, nextAttempts),
        options.driverName
      );
      result.retried++;
    } else {
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
