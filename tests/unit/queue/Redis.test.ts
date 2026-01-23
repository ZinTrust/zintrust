import Queue from '@queue/Queue';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const makeFakeQueueDriver = () => {
  const store = new Map<string, string[]>();
  return {
    enqueue: async (queue: string, payload: unknown) => {
      const id = `job-${Math.random().toString(36).slice(2)}`;
      const msg = JSON.stringify({ id, payload, attempts: 0 });
      const arr = store.get(queue) ?? [];
      arr.push(msg);
      store.set(queue, arr);
      return id;
    },
    dequeue: async (queue: string) => {
      const arr = store.get(queue) ?? [];
      if (arr.length === 0) return undefined;
      const raw = arr.shift()!;
      store.set(queue, arr);
      return JSON.parse(raw);
    },
    ack: async () => undefined,
    length: async (queue: string) => (store.get(queue) ?? []).length,
    drain: async (queue: string) => {
      store.delete(queue);
    },
  };
};

describe('RedisQueue', () => {
  beforeEach(() => {
    vi.resetModules();
    Queue.reset();
    vi.doMock('../../../packages/queue-redis/src/RedisQueue', () => ({
      default: makeFakeQueueDriver(),
    }));
  });

  it('enqueues and dequeues messages', async () => {
    const { default: RedisQueue } = await import('../../../packages/queue-redis/src/RedisQueue');
    Queue.register('redis', RedisQueue as any);
    const id = await Queue.enqueue('jobs', { work: 123 }, 'redis');
    expect(typeof id).toBe('string');

    const msg = await Queue.dequeue<{ work: number }>('jobs', 'redis');
    expect(msg).toBeDefined();
    expect(msg?.payload.work).toBe(123);
  });

  it('returns undefined when queue empty', async () => {
    const { default: RedisQueue } = await import('../../../packages/queue-redis/src/RedisQueue');
    Queue.register('redis', RedisQueue as any);
    const msg = await Queue.dequeue('nothing', 'redis');
    expect(msg).toBeUndefined();
  });

  it('returns length and drains', async () => {
    const { default: RedisQueue } = await import('../../../packages/queue-redis/src/RedisQueue');
    Queue.register('redis', RedisQueue as any);
    await Queue.enqueue('jobs2', { a: 1 }, 'redis');
    await Queue.enqueue('jobs2', { a: 2 }, 'redis');
    const len = await Queue.length('jobs2', 'redis');
    expect(len).toBe(2);

    await Queue.drain('jobs2', 'redis');
    const len2 = await Queue.length('jobs2', 'redis');
    expect(len2).toBe(0);
  });
});
