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

vi.mock('@zintrust/core/redis', () => ({
  createRedisConnection: () => mockClient,
}));

import { RedisCacheDriver } from '../../../../packages/cache-redis/src/index';

describe('Redis cache driver (Workers)', () => {
  it('uses shared redis transport when proxy mode is enabled', async () => {
    vi.resetModules();

    const proxyClient = {
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

    vi.doMock('@zintrust/core/config', () => ({
      Env: {
        REDIS_PROXY_URL: 'http://127.0.0.1:8791/redis',
        USE_REDIS_PROXY: true,
      },
    }));
    vi.doMock('@zintrust/core/redis', () => ({
      createRedisConnection: () => proxyClient,
    }));

    const { RedisCacheDriver: RedisCacheDriverWithProxy } =
      await import('../../../../packages/cache-redis/src/index');
    const cache = RedisCacheDriverWithProxy.create({
      driver: 'redis',
      host: 'localhost',
      port: 6379,
      ttl: 60,
    });

    await cache.set('proxy-key', { ok: true });
    await expect(cache.get<{ ok: boolean }>('proxy-key')).resolves.toEqual({ ok: true });
    await expect(cache.has('proxy-key')).resolves.toBe(true);
  });

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

  it('passes password and database to the Node redis client', async () => {
    vi.resetModules();

    const createClient = vi.fn(() => ({
      connect: async () => undefined,
      quit: async () => undefined,
      get: async () => null,
      set: async () => 'OK',
      del: async () => 0,
      exists: async () => 0,
      flushDb: async () => undefined,
    }));

    vi.doMock('redis', () => ({ createClient }));

    vi.doMock('@zintrust/core/config', () => ({
      Env: {
        REDIS_PROXY_URL: '',
        USE_REDIS_PROXY: false,
      },
    }));
    vi.doMock('@zintrust/core/cloudflare', () => ({
      Cloudflare: {
        getWorkersEnv: () => null,
      },
    }));

    const { RedisCacheDriver: NodeDriver } =
      await import('../../../../packages/cache-redis/src/index');

    const cache = NodeDriver.create({
      driver: 'redis',
      host: 'redis.internal',
      port: 6380,
      password: 'secret-pass',
      database: 7,
      ttl: 60,
    });

    await expect(cache.get('node-auth-key')).resolves.toBeNull();

    expect(createClient).toHaveBeenCalledWith({
      socket: { host: 'redis.internal', port: 6380 },
      password: 'secret-pass',
      database: 7,
    });
  });

  it('disables the cache driver after Redis auth is rejected', async () => {
    vi.resetModules();

    const authError = new Error('NOAUTH Authentication required.');
    const errorSpy = vi.fn();

    vi.doMock('redis', () => ({
      createClient: () => ({
        connect: async () => undefined,
        quit: async () => undefined,
        get: async () => {
          throw authError;
        },
        set: async () => {
          throw authError;
        },
        del: async () => {
          throw authError;
        },
        exists: async () => {
          throw authError;
        },
        flushDb: async () => {
          throw authError;
        },
      }),
    }));

    vi.doMock('@zintrust/core/logger', () => ({
      Logger: {
        error: errorSpy,
      },
    }));

    const { RedisCacheDriver: AuthFailingDriver } =
      await import('../../../../packages/cache-redis/src/index');

    const cache = AuthFailingDriver.create({
      driver: 'redis',
      host: 'localhost',
      port: 6379,
      ttl: 60,
    });

    await expect(cache.get('auth-key')).resolves.toBeNull();
    await expect(cache.set('auth-key', { ok: true })).resolves.toBeUndefined();
    await expect(cache.delete('auth-key')).resolves.toBeUndefined();
    await expect(cache.clear()).resolves.toBeUndefined();
    await expect(cache.has('auth-key')).resolves.toBe(false);

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith('Redis cache GET failed', authError);
  });
});
