import { ensureDriver } from '@/config/redis';
import type { QueueMessage } from '@tools/queue/Queue';

export const RedisQueue = (() => {
  return {
    __zintrustCoreRedisQueue: true,
    async enqueue<T = unknown>(queue: string, payload: T): Promise<string> {
      const driver = await ensureDriver();
      return driver.enqueue(queue, payload);
    },

    async dequeue<T = unknown>(queue: string): Promise<QueueMessage<T> | undefined> {
      const driver = await ensureDriver();
      return driver.dequeue(queue);
    },

    async ack(_queue: string, _id: string): Promise<void> {
      const driver = await ensureDriver();
      await driver.ack(_queue, _id);
    },

    async length(queue: string): Promise<number> {
      const driver = await ensureDriver();
      return driver.length(queue);
    },

    async drain(queue: string): Promise<void> {
      const driver = await ensureDriver();
      await driver.drain(queue);
    },
  } as const;
})();

export default RedisQueue;
