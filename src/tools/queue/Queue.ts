import { ZintrustLang } from '@/lang/lang';
import { Env } from '@config/env';
import { ErrorFactory } from '@exceptions/ZintrustError';
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

export const Queue = Object.freeze({
  register(name: string, driver: IQueueDriver) {
    drivers.set(name.toLowerCase(), driver);
  },

  reset(): void {
    drivers.clear();
  },

  get(name?: string): IQueueDriver {
    const resolved = (name ?? Env.QUEUE_CONNECTION) || Env.QUEUE_DRIVER || ZintrustLang.INMEMORY;
    const driverName = (
      resolved !== null && resolved !== undefined ? String(resolved) : ZintrustLang.INMEMORY
    )
      .trim()
      .toLowerCase();
    const driver = drivers.get(driverName);
    if (!driver) {
      throw ErrorFactory.createConfigError(`Queue driver not registered: ${driverName}`);
    }
    return driver;
  },

  async enqueue(queue: string, payload: BullMQPayload, driverName?: string): Promise<string> {
    const driver = Queue.get(driverName);
    const jobId = await driver.enqueue(queue, payload);
    return jobId;
  },

  async dequeue<T = unknown>(
    queue: string,
    driverName?: string
  ): Promise<QueueMessage<T> | undefined> {
    const driver = Queue.get(driverName);
    return driver.dequeue(queue);
  },

  async ack(queue: string, id: string, driverName?: string): Promise<void> {
    const driver = Queue.get(driverName);
    return driver.ack(queue, id);
  },

  async length(queue: string, driverName?: string): Promise<number> {
    const driver = Queue.get(driverName);
    return driver.length(queue);
  },

  async drain(queue: string, driverName?: string): Promise<void> {
    const driver = Queue.get(driverName);
    return driver.drain(queue);
  },
});

export default Queue;
