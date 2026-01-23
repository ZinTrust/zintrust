import Queue from '@queue/Queue';
import RedisQueue from '../../../packages/queue-redis/src/RedisQueue';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Create a fake redis client to be returned by require('redis').createClient
const makeFakeRedisClient = () => {
  const store = new Map<string, string[]>();
  return {
    connect: async () => undefined,
    rPush: async (queue: string, value: string) => {
      const arr = store.get(queue) ?? [];
      arr.push(value);
      store.set(queue, arr);
      return arr.length;
    },
    lPop: async (queue: string) => {
      const arr = store.get(queue) ?? [];
      if (arr.length === 0) return null;
      const v = arr.shift()!;
      store.set(queue, arr);
      return v;
    },
    lLen: async (queue: string) => {
      const arr = store.get(queue) ?? [];
      return arr.length;
    },
    del: async (queue: string) => {
      const had = store.has(queue) ? 1 : 0;
      store.delete(queue);
      return had;
    },
  };
};

describe('RedisQueue', () => {
  beforeEach(() => {
    // Provide a fake REDIS_URL so the driver doesn't error on startup
    process.env['REDIS_URL'] = 'redis://localhost:6379';

    // Inject a fake redis client via globalThis so the driver can fall back when 'redis' package
    // is not present in the test environment
    (globalThis as any).__fakeRedisClient = makeFakeRedisClient();

    // Also mock the redis module in case it's available in consumers
    vi.mock('redis', () => ({
      createClient: () => makeFakeRedisClient(),
    }));
  });

  it('enqueues and dequeues messages', async () => {
    Queue.register('redis', RedisQueue as any);
    const id = await Queue.enqueue('jobs', { work: 123 }, 'redis');
    expect(typeof id).toBe('string');

    const msg = await Queue.dequeue<{ work: number }>('jobs', 'redis');
    expect(msg).toBeDefined();
    expect(msg?.payload.work).toBe(123);
  });

  it('returns undefined when queue empty', async () => {
    Queue.register('redis', RedisQueue as any);
    const msg = await Queue.dequeue('nothing', 'redis');
    expect(msg).toBeUndefined();
  });

  it('returns length and drains', async () => {
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
