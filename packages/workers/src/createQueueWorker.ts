import type { BullMQPayload, QueueMessage } from '@zintrust/core';
import { Logger, Queue } from '@zintrust/core';

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
      const attempts = (message as QueueMessage<TPayload> & { attempts?: number }).attempts ?? 0;

      Logger.error(`Failed to process ${options.kindLabel}`, {
        ...baseLogFields,
        error,
        attempts,
      });

      if (attempts < options.maxAttempts) {
        await Queue.enqueue(queueName, message.payload as BullMQPayload, driverName);
        Logger.info(`${options.kindLabel} re-queued for retry`, {
          ...baseLogFields,
          attempts: attempts + 1,
        });
      }

      await Queue.ack(queueName, message.id, driverName);
      return false;
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
}) => Promise<number>) => {
  return async (opts = {}): Promise<number> => {
    const { queueName = defaultQueueName, driverName, maxItems, maxDurationMs = 30000 } = opts;
    let processed = 0;
    const startTime = Date.now();

    if (maxItems === undefined) {
      while (true) {
        if (maxDurationMs > 0 && Date.now() - startTime > maxDurationMs) {
          Logger.warn('Queue processing timeout reached', { queueName, processed });
          break;
        }
        const didProcess = await processOne(queueName, driverName);
        if (!didProcess) break;
        processed++;
      }
      return processed;
    }

    for (let i = 0; i < maxItems; i++) {
      const didProcess = await processOne(queueName, driverName);
      if (!didProcess) break;
      processed++;
    }

    return processed;
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
}) => Promise<number>) => {
  return async (opts = {}): Promise<number> => {
    const { queueName = defaultQueueName, driverName, signal, maxDurationMs = 300000 } = opts;

    Logger.info(`Starting ${kindLabel} worker (drain-until-empty)`, { queueName });

    let processedCount = 0;
    const startTime = Date.now();
    while (signal?.aborted !== true) {
      if (maxDurationMs > 0 && Date.now() - startTime > maxDurationMs) {
        Logger.warn(`${kindLabel} worker timeout reached`, { queueName, processedCount });
        break;
      }
      const didProcess = await processOne(queueName, driverName);
      if (!didProcess) break;
      processedCount++;
    }

    Logger.info(`${kindLabel} worker finished (queue drained)`, { queueName, processedCount });
    return processedCount;
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
