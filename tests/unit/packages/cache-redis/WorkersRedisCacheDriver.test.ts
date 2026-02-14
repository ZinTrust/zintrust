import { describe, expect, it, vi } from 'vitest';

const store = new Map<string, string>();

const mockClient = {
  connect: async () => undefined,
  quit: async () => undefined,
  get: async (key: string) => store.get(key) ?? null,
  set: async (key: string, value: string) => {
    store.set(key, value);
    return 'OK';
  },
  del: async (key: string) => (store.delete(key) ? 1 : 0),
  exists: async (key: string) => (store.has(key) ? 1 : 0),
  flushdb: async () => {
    store.clear();
  },
};

vi.mock('@zintrust/core', async () => {
  const actual = await vi.importActual<typeof import('@zintrust/core')>('@zintrust/core');
  return {
    ...actual,
    createRedisConnection: () => mockClient,
  };
});

import { RedisCacheDriver } from '../../../../packages/cache-redis/src/index';

describe('Redis cache driver (Workers)', () => {
  it('uses ioredis connection when sockets enabled', async () => {
    const originalEnv = (globalThis as unknown as { env?: unknown }).env;
    (globalThis as unknown as { env?: unknown }).env = {
      ENABLE_CLOUDFLARE_SOCKETS: 'true',
    };

    const cache = RedisCacheDriver.create({
      driver: 'redis',
      host: 'localhost',
      port: 6379,
      ttl: 60,
    });

    await cache.set('test-key', { ok: true });
    const value = await cache.get<{ ok: boolean }>('test-key');
    expect(value).toEqual({ ok: true });
    expect(await cache.has('test-key')).toBe(true);

    await cache.clear();
    expect(await cache.has('test-key')).toBe(false);

    if (originalEnv === undefined) {
      delete (globalThis as unknown as { env?: unknown }).env;
    } else {
      (globalThis as unknown as { env?: unknown }).env = originalEnv;
    }
  });
});
