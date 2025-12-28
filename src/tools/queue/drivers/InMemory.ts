import { QueueMessage } from '@queue/Queue';
const generateId = (): string => {
  if (typeof globalThis?.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
};

type InternalMessage = QueueMessage & { enqueuedAt: number };

export const InMemoryQueue = (() => {
  const store = new Map<string, InternalMessage[]>();

  const ensure = (queue: string): void => {
    if (!store.has(queue)) store.set(queue, []);
  };

  return {
    async enqueue<T = unknown>(queue: string, payload: T): Promise<string> {
      ensure(queue);
      const id = generateId();
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
      return;
    },

    async length(queue: string): Promise<number> {
      ensure(queue);
      const arr = store.get(queue);
      return arr ? arr.length : 0;
    },

    async drain(queue: string): Promise<void> {
      ensure(queue);
      store.set(queue, []);
    },
  } as const;
})();

export default InMemoryQueue;
