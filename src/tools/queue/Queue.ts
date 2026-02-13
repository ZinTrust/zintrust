import { ZintrustLang } from '@/lang/lang';
import { Env } from '@config/env';
import { Logger } from '@config/logger';
import { ErrorFactory } from '@exceptions/ZintrustError';
import { JobStateTracker } from '@queue/JobStateTracker';
import { QueueTracing } from '@queue/QueueTracing';
import { RedisKeys } from '@tools/redis/RedisKeyManager';

export type QueueMessage<T = unknown> = { id: string; payload: T; attempts: number };

export interface IQueueDriver {
  enqueue<T = unknown>(queue: string, payload: T): Promise<string>;
  dequeue<T = unknown>(queue: string): Promise<QueueMessage<T> | undefined>;
  ack(queue: string, id: string): Promise<void>;
  length(queue: string): Promise<number>;
  drain(queue: string): Promise<void>;
}

/**
 * BullMQ payload interface with all supported JobOptions
 */
export interface BullMQPayload {
  // Application-specific fields (passed through to payload)
  to?: string;
  subject?: string;
  template?: string;
  templateData?: Record<string, unknown>;
  timestamp?: number;
  attempts?: number;

  // BullMQ JobOptions fields (extracted to jobOptions)
  uniqueId?: string;
  delay?: number;
  priority?: number;
  removeOnComplete?: number | boolean;
  removeOnFail?: number | boolean;
  backoff?: {
    type: 'fixed' | 'exponential';
    delay: number;
  };
  repeat?: {
    every?: number;
    cron?: string;
    limit?: number;
  };
  lifo?: boolean;

  // Advanced deduplication patterns
  deduplication?: {
    id: string;
    ttl?: number;
    releaseAfter?: string | number | { condition: string; delay: number };
  };

  // Custom lock provider
  uniqueVia?: string;

  // Allow additional properties for metadata and extensions
  [key: string]: unknown;
}

let redis_key_prefix: string | undefined;

/**
 * Resolves the lock prefix for queue operations
 * Uses singleton RedisKeys for consistent key management
 */
export const resolveLockPrefix = (): string => {
  if (redis_key_prefix !== undefined) {
    return redis_key_prefix;
  }

  redis_key_prefix = RedisKeys.queueLockPrefix;
  return redis_key_prefix;
};

const drivers = new Map<string, IQueueDriver>();

const resolveDriverName = (name?: string): string => {
  const resolved = (name ?? Env.QUEUE_CONNECTION) || Env.QUEUE_DRIVER || ZintrustLang.INMEMORY;
  return (resolved !== null && resolved !== undefined ? String(resolved) : ZintrustLang.INMEMORY)
    .trim()
    .toLowerCase();
};

const shouldPreserveExistingStatus = (queueName: string, jobId: string): boolean => {
  const existing = JobStateTracker.get(queueName, jobId);
  return existing?.status === 'pending_recovery';
};

const resolveRequestedUniqueId = (payload: BullMQPayload): string | undefined => {
  if (typeof payload?.uniqueId !== 'string') return undefined;
  const normalized = payload.uniqueId.trim();
  return normalized.length > 0 ? normalized : undefined;
};

const resolveMaxAttempts = (payload: BullMQPayload): number | undefined => {
  if (typeof payload?.attempts !== 'number' || !Number.isFinite(payload.attempts)) return undefined;
  return payload.attempts > 0 ? Math.floor(payload.attempts) : undefined;
};

const resolveExpectedCompletionAt = (): string => {
  return new Date(
    Date.now() + Math.max(1000, Env.getInt('QUEUE_JOB_TIMEOUT', 60) * 1000)
  ).toISOString();
};

const markEnqueued = async (input: {
  queueName: string;
  jobId: string;
  payload: BullMQPayload;
  requestedUniqueId?: string;
}): Promise<void> => {
  await JobStateTracker.enqueued({
    queueName: input.queueName,
    jobId: input.jobId,
    payload: input.payload,
    maxAttempts: resolveMaxAttempts(input.payload),
    expectedCompletionAt: resolveExpectedCompletionAt(),
    idempotencyKey: input.requestedUniqueId,
  });
};

const createFallbackJobId = (requestedUniqueId: string | undefined): string => {
  if (requestedUniqueId !== undefined) return requestedUniqueId;
  return `fallback-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
};

const markFailedEnqueue = async (input: {
  queueName: string;
  payload: BullMQPayload;
  requestedUniqueId?: string;
  error: unknown;
}): Promise<string> => {
  const fallbackJobId = createFallbackJobId(input.requestedUniqueId);

  await markEnqueued({
    queueName: input.queueName,
    jobId: fallbackJobId,
    payload: input.payload,
    requestedUniqueId: input.requestedUniqueId,
  });

  await JobStateTracker.pendingRecovery({
    queueName: input.queueName,
    jobId: fallbackJobId,
    reason: 'Queue enqueue failed; marked pending recovery by core queue layer',
    error: input.error,
  });

  return fallbackJobId;
};

export const Queue = Object.freeze({
  register(name: string, driver: IQueueDriver) {
    drivers.set(name.toLowerCase(), driver);
  },

  reset(): void {
    drivers.clear();
  },

  get(name?: string): IQueueDriver {
    const driverName = resolveDriverName(name);
    const driver = drivers.get(driverName);
    if (!driver) {
      throw ErrorFactory.createConfigError(`Queue driver not registered: ${driverName}`);
    }
    return driver;
  },

  async enqueue(queue: string, payload: BullMQPayload, driverName?: string): Promise<string> {
    const resolvedDriver = resolveDriverName(driverName);
    const requestedUniqueId = resolveRequestedUniqueId(payload);

    try {
      const jobId = await QueueTracing.traceOperation({
        queueName: queue,
        operation: 'enqueue',
        attributes: {
          driverName: resolvedDriver,
          hasUniqueId: requestedUniqueId !== undefined,
        },
        execute: async () => {
          const driver = Queue.get(driverName);
          return driver.enqueue(queue, payload);
        },
      });

      Logger.info('Queue enqueue succeeded', {
        queue,
        driver: resolvedDriver,
        jobId,
        requestedUniqueId,
      });

      if (shouldPreserveExistingStatus(queue, jobId)) {
        Logger.warn(
          'Queue enqueue returned job already marked pending recovery; preserving status',
          {
            queue,
            driver: resolvedDriver,
            jobId,
            requestedUniqueId,
          }
        );
        return jobId;
      }

      await markEnqueued({
        queueName: queue,
        jobId,
        payload,
        requestedUniqueId,
      });

      return jobId;
    } catch (error) {
      const fallbackJobId = await markFailedEnqueue({
        queueName: queue,
        payload,
        requestedUniqueId,
        error,
      });

      Logger.warn('Queue enqueue failed', {
        queue,
        driver: resolvedDriver,
        fallbackJobId,
        requestedUniqueId,
        error: error instanceof Error ? error.message : String(error),
      });

      throw error;
    }
  },

  async dequeue<T = unknown>(
    queue: string,
    driverName?: string
  ): Promise<QueueMessage<T> | undefined> {
    return QueueTracing.traceOperation({
      queueName: queue,
      operation: 'dequeue',
      attributes: {
        driverName: driverName ?? null,
      },
      execute: async () => {
        const driver = Queue.get(driverName);
        return driver.dequeue<T>(queue);
      },
    });
  },

  async ack(queue: string, id: string, driverName?: string): Promise<void> {
    return QueueTracing.traceOperation({
      queueName: queue,
      operation: 'ack',
      attributes: {
        driverName: driverName ?? null,
      },
      execute: async () => {
        const driver = Queue.get(driverName);
        await driver.ack(queue, id);
      },
    });
  },

  async length(queue: string, driverName?: string): Promise<number> {
    return QueueTracing.traceOperation({
      queueName: queue,
      operation: 'length',
      attributes: {
        driverName: driverName ?? null,
      },
      execute: async () => {
        const driver = Queue.get(driverName);
        return driver.length(queue);
      },
    });
  },

  async drain(queue: string, driverName?: string): Promise<void> {
    return QueueTracing.traceOperation({
      queueName: queue,
      operation: 'drain',
      attributes: {
        driverName: driverName ?? null,
      },
      execute: async () => {
        const driver = Queue.get(driverName);
        await driver.drain(queue);
      },
    });
  },
});

export default Queue;
