import { describe, expect, it, vi } from 'vitest';

vi.mock('node:module', () => {
  return {
    createRequire: () => () => {
      throw new Error('missing');
    },
  };
});

describe('workers config optional ioredis', () => {
  it('throws a config error only when Redis connection is requested', async () => {
    const mod = await import('../../../src/config/workers');

    expect(() => mod.createRedisConnection({ host: 'localhost', port: 6379 })).toThrow(/ioredis/i);
  });
});
