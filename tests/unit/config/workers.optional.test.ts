import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@node-singletons/module', () => {
  return {
    createRequire: () => () => {
      throw new Error('missing');
    },
  };
});

describe('workers config optional ioredis', () => {
  afterEach(() => {
    delete (globalThis as unknown as { __zintrustIoredisModule?: unknown }).__zintrustIoredisModule;
    vi.resetModules();
  });

  it('throws a config error only when Redis connection is requested', async () => {
    const mod = await import('../../../src/config/workers');

    expect(() => mod.createRedisConnection({ host: 'localhost', port: 6379 })).toThrow(/ioredis/i);
  });

  it('throws when resolved module lacks Redis export', async () => {
    vi.doMock('@node-singletons/module', () => ({
      createRequire: () => () => ({ notRedis: true }),
    }));

    const mod = await import('../../../src/config/workers');
    expect(() => mod.createRedisConnection({ host: 'localhost', port: 6379 })).toThrow(/ioredis/i);

    // Second call hits cached null branch
    expect(() => mod.createRedisConnection({ host: 'localhost', port: 6379 })).toThrow(/ioredis/i);
  });

  it('throws when resolved module is not an object or function', async () => {
    vi.doMock('@node-singletons/module', () => ({
      createRequire: () => () => 'not-a-module',
    }));

    const mod = await import('../../../src/config/workers');
    expect(() => mod.createRedisConnection({ host: 'localhost', port: 6379 })).toThrow(/ioredis/i);
  });
});
