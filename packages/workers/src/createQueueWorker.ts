import type { BullMQPayload, QueueMessage } from '@zintrust/core';
import { Logger, Queue } from '@zintrust/core';

const RETRY_BASE_DELAY_MS = 1000;
const RETRY_MAX_DELAY_MS = 30000;

const normalizeAttempts = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return Math.floor(value);
  }
  return 0;
};

const getAttemptsFromMessage = <TPayload>(message: QueueMessage<TPayload>): number => {
  const payloadAttempts =
    typeof message.payload === 'object' && message.payload !== null
      ? normalizeAttempts((message.payload as Record<string, unknown>)['attempts'])
      : 0;
  const messageAttempts = normalizeAttempts(
    (message as QueueMessage<TPayload> & { attempts?: number }).attempts
  );
  return Math.max(payloadAttempts, messageAttempts);
};

const getRetryDelayMs = (nextAttempts: number): number => {
  const exponentialDelay = Math.min(
    RETRY_BASE_DELAY_MS * 2 ** Math.max(0, nextAttempts - 1),
    RETRY_MAX_DELAY_MS
  );
  const jitterMs = Math.floor(Math.random() * 250);
  return exponentialDelay + jitterMs;
};

type QueueWorker = {
  processOne: (queueName?: string, driverName?: string) => Promise<boolean>;
  processAll: (queueName?: string, driverName?: string) => Promise<number>;
  runOnce: (opts?: {
    queueName?: string;
    driverName?: string;
    maxItems?: number;
    maxDurationMs?: number;
  }) => Promise<number>;
  startWorker: (opts?: {
    queueName?: string;
    driverName?: string;
    signal?: AbortSignal;
    maxDurationMs?: number;
  }) => Promise<number>;
};

export type CreateQueueWorkerOptions<TPayload> = {
  kindLabel: string;
  defaultQueueName: string;
  maxAttempts: number;
  getLogFields: (payload: TPayload) => Record<string, unknown>;
  handle: (payload: TPayload) => Promise<void>;
};

const buildBaseLogFields = <TPayload>(
  message: QueueMessage<TPayload>,
  getLogFields: (payload: TPayload) => Record<string, unknown>
): Record<string, unknown> => {
  return {
    messageId: message.id,
    ...getLogFields(message.payload),
  };
};

const createProcessOne = <TPayload>(
  options: CreateQueueWorkerOptions<TPayload>
): ((queueName?: string, driverName?: string) => Promise<boolean>) => {
  return async (queueName = options.defaultQueueName, driverName?: string): Promise<boolean> => {
    const message = await Queue.dequeue<TPayload>(queueName, driverName);
    if (!message) return false;

    const baseLogFields = buildBaseLogFields(message, options.getLogFields);

    // Check for delayed execution
    const payload = message.payload as Record<string, unknown> & { timestamp?: number };
    const rawTimestamp = 'timestamp' in payload ? payload['timestamp'] : 0;
    const timestamp = typeof rawTimestamp === 'number' ? rawTimestamp : 0;

    if (timestamp > Date.now()) {
      Logger.info(`${options.kindLabel} not due yet, re-queueing`, {
        ...baseLogFields,
        dueAt: new Date(timestamp).toISOString(),
      });
      // Re-queue original payload
      await Queue.enqueue(queueName, message.payload as BullMQPayload, driverName);
      await Queue.ack(queueName, message.id, driverName);
      return false;
    }

    try {
      Logger.info(`Processing queued ${options.kindLabel}`, baseLogFields);
      await options.handle(message.payload);
      await Queue.ack(queueName, message.id, driverName);
      Logger.info(`${options.kindLabel} processed successfully`, baseLogFields);
      return true;
    } catch (error) {
      const attempts = getAttemptsFromMessage(message);
      const nextAttempts = attempts + 1;

      Logger.error(`Failed to process ${options.kindLabel}`, {
        ...baseLogFields,
        error,
        attempts: nextAttempts,
      });

      if (nextAttempts < options.maxAttempts) {
        const retryDelayMs = getRetryDelayMs(nextAttempts);
        const currentPayload =
          typeof message.payload === 'object' && message.payload !== null
            ? (message.payload as Record<string, unknown>)
            : ({ payload: message.payload } as Record<string, unknown>);

        const payloadForRetry: BullMQPayload = {
          ...currentPayload,
          attempts: nextAttempts,
          timestamp: Date.now() + retryDelayMs,
        };

        await Queue.enqueue(queueName, payloadForRetry, driverName);
        Logger.info(`${options.kindLabel} re-queued for retry`, {
          ...baseLogFields,
          attempts: nextAttempts,
          retryDelayMs,
        });
      }

      await Queue.ack(queueName, message.id, driverName);
      // We processed the message (even if it failed), so return true to continue processing
      return true;
    }
  };
};

const createProcessAll = (
  defaultQueueName: string,
  processOne: (queueName?: string, driverName?: string) => Promise<boolean>
): ((queueName?: string, driverName?: string) => Promise<number>) => {
  return async (queueName = defaultQueueName, driverName?: string): Promise<number> => {
    let processed = 0;
    let hasMore = true;

    while (hasMore) {
      // eslint-disable-next-line no-await-in-loop
      hasMore = await processOne(queueName, driverName);
      if (hasMore) processed++;
    }

    return processed;
  };
};

const createRunOnce = (
  defaultQueueName: string,
  processOne: (queueName?: string, driverName?: string) => Promise<boolean>
): ((opts?: {
  queueName?: string;
  driverName?: string;
  maxItems?: number;
  maxDurationMs?: number;
  concurrency?: number;
}) => Promise<number>) => {
  return async (opts = {}): Promise<number> => {
    const {
      queueName = defaultQueueName,
      driverName,
      maxItems,
      maxDurationMs = 30000,
      concurrency = 1,
    } = opts;
    const startTime = Date.now();
    let totalProcessed = 0;

    // Helper for single worker loop
    const runWorker = async (): Promise<number> => {
      let workerProcessed = 0;
      while (true) {
        if (maxDurationMs > 0 && Date.now() - startTime > maxDurationMs) {
          break;
        }
        if (maxItems !== undefined && totalProcessed >= maxItems) {
          break;
        }

        // eslint-disable-next-line no-await-in-loop
        const didProcess = await processOne(queueName, driverName);
        if (!didProcess) break;

        workerProcessed++;
        totalProcessed++; // Shared counter (approximation in parallel)
      }
      return workerProcessed;
    };

    // Run workers in parallel
    await Promise.all(Array.from({ length: Math.max(1, concurrency) }).map(() => runWorker()));

    return totalProcessed;
  };
};

const createStartWorker = (
  kindLabel: string,
  defaultQueueName: string,
  processOne: (queueName?: string, driverName?: string) => Promise<boolean>
): ((opts?: {
  queueName?: string;
  driverName?: string;
  signal?: AbortSignal;
  maxDurationMs?: number;
  concurrency?: number;
}) => Promise<number>) => {
  return async (opts = {}): Promise<number> => {
    const {
      queueName = defaultQueueName,
      driverName,
      signal,
      maxDurationMs = 300000,
      concurrency = 1,
    } = opts;

    Logger.info(`Starting ${kindLabel} worker (drain-until-empty)`, { queueName, concurrency });

    const startTime = Date.now();
    let totalProcessed = 0;

    const runWorker = async (): Promise<void> => {
      while (signal?.aborted !== true) {
        if (maxDurationMs > 0 && Date.now() - startTime > maxDurationMs) {
          Logger.warn(`${kindLabel} worker timeout reached`, { queueName, totalProcessed });
          break;
        }

        // eslint-disable-next-line no-await-in-loop
        const didProcess = await processOne(queueName, driverName);
        if (!didProcess) break;
        totalProcessed++;
      }
    };

    // Run workers in parallel
    await Promise.all(Array.from({ length: Math.max(1, concurrency) }).map(() => runWorker()));

    Logger.info(`${kindLabel} worker finished (queue drained)`, { queueName, totalProcessed });
    return totalProcessed;
  };
};

export function createQueueWorker<TPayload>(
  options: CreateQueueWorkerOptions<TPayload>
): QueueWorker {
  const processOne = createProcessOne(options);
  const processAll = createProcessAll(options.defaultQueueName, processOne);
  const runOnce = createRunOnce(options.defaultQueueName, processOne);
  const startWorker = createStartWorker(options.kindLabel, options.defaultQueueName, processOne);

  return Object.freeze({ processOne, processAll, runOnce, startWorker });
}
