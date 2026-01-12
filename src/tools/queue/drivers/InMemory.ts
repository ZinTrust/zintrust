import { generateUuid } from '@/common/utility';
import { QueueMessage } from '@tools/queue/Queue';

type InternalMessage = QueueMessage & { enqueuedAt: number };

export const InMemoryQueue = (() => {
  const store = new Map<string, InternalMessage[]>();

  const ensure = (queue: string): void => {
    if (!store.has(queue)) store.set(queue, []);
  };

  return {
    async enqueue<T = unknown>(queue: string, payload: T): Promise<string> {
      await Promise.resolve();
      ensure(queue);
      const id = generateUuid();
      const msg: InternalMessage = {
        id,
        payload: payload,
        attempts: 0,
        enqueuedAt: Date.now(),
      };
      const arr = store.get(queue);
      if (arr && arr.length > 0) {
        arr.push(msg);
      } else {
        store.set(queue, [msg]);
      }
      return id;
    },

    async dequeue<T = unknown>(queue: string): Promise<QueueMessage<T> | undefined> {
      await Promise.resolve();
      ensure(queue);
      const arr = store.get(queue);
      if (arr && arr.length > 0) {
        const msg = arr.shift();
        return msg as QueueMessage<T> | undefined;
      }
      return undefined;
    },

    async ack(_queue: string, _id: string): Promise<void> {
      // in-memory dequeue already removed the message; ack is a no-op
      await Promise.resolve();
    },

    async length(queue: string): Promise<number> {
      await Promise.resolve();
      ensure(queue);
      const arr = store.get(queue);
      return Array.isArray(arr) ? arr.length : 0;
    },

    async drain(queue: string): Promise<void> {
      await Promise.resolve();
      ensure(queue);
      store.set(queue, []);
    },
  } as const;
})();

export default InMemoryQueue;
