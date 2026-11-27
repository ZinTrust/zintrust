import { generateUuid } from '@/common/utility';
import type { QueueMessage } from '@tools/queue/Queue';

type InternalMessage = QueueMessage & { enqueuedAt: number };

/** Bounds the in-memory queue store so user-derived queue names cannot grow it forever. */
const MAX_QUEUES = 1000;
const MAX_MESSAGES_PER_QUEUE = 10_000;

export const InMemoryQueue = (() => {
  const store = new Map<string, InternalMessage[]>();

  return {
    async enqueue<T = unknown>(queue: string, payload: T): Promise<string> {
      await Promise.resolve();
      let arr = store.get(queue);
      if (arr === undefined) {
        if (store.size >= MAX_QUEUES && !store.has(queue)) {
          const oldest = store.keys().next().value;
          if (oldest !== undefined) store.delete(oldest);
        }
        arr = [];
        store.set(queue, arr);
      }
      while (arr.length >= MAX_MESSAGES_PER_QUEUE) {
        arr.shift();
      }
      const id = generateUuid();
      const msg: InternalMessage = {
        id,
        payload: payload,
        attempts: 0,
        enqueuedAt: Date.now(),
      };
      arr.push(msg);
      return id;
    },

    async dequeue<T = unknown>(queue: string): Promise<QueueMessage<T> | undefined> {
      await Promise.resolve();
      // Read paths must not create permanent empty queues.
      const arr = store.get(queue);
      if (arr === undefined || arr.length === 0) return undefined;
      const msg = arr.shift();
      if (arr.length === 0) store.delete(queue);
      return msg as QueueMessage<T> | undefined;
    },

    async ack(_queue: string, _id: string): Promise<void> {
      // in-memory dequeue already removed the message; ack is a no-op
      await Promise.resolve();
    },

    async length(queue: string): Promise<number> {
      await Promise.resolve();
      const arr = store.get(queue);
      return Array.isArray(arr) ? arr.length : 0;
    },

    async drain(queue: string): Promise<void> {
      await Promise.resolve();
      // No need to materialize an empty queue just to drain it.
      store.delete(queue);
    },
  } as const;
})();

export default InMemoryQueue;
