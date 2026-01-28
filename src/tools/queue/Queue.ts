import { ZintrustLang } from '@/lang/lang';
import { Env } from '@config/env';
import { ErrorFactory } from '@exceptions/ZintrustError';

export type QueueMessage<T = unknown> = { id: string; payload: T; attempts: number };

interface IQueueDriver {
  enqueue<T = unknown>(queue: string, payload: T): Promise<string>;
  dequeue<T = unknown>(queue: string): Promise<QueueMessage<T> | undefined>;
  ack(queue: string, id: string): Promise<void>;
  length(queue: string): Promise<number>;
  drain(queue: string): Promise<void>;
}

let redis_key_prefix: string | undefined;

export const resolveLockPrefix = (): string => {
  if (redis_key_prefix !== undefined) {
    return redis_key_prefix;
  }

  const prefix = Env.get('QUEUE_LOCK_PREFIX', ZintrustLang.ZINTRUST_LOCKS_PREFIX).trim();
  redis_key_prefix = prefix.length > 0 ? prefix : ZintrustLang.ZINTRUST_LOCKS_PREFIX;
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
    const resolved = (name ?? Env.QUEUE_CONNECTION) || Env.QUEUE_DRIVER || 'inmemory';
    const driverName = (resolved !== null && resolved !== undefined ? String(resolved) : 'inmemory')
      .trim()
      .toLowerCase();
    const driver = drivers.get(driverName);
    if (!driver) throw ErrorFactory.createConfigError(`Queue driver not registered: ${driverName}`);
    return driver;
  },

  async enqueue<T = unknown>(queue: string, payload: T, driverName?: string): Promise<string> {
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
