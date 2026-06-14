/* eslint-disable max-nested-callbacks */
import { describe, expect, it, vi } from 'vitest';

describe('patch coverage: RedisDriver ioredis branches', () => {
  it('uses ioredis-backed driver when available (parses JSON, handles null, logs errors)', async () => {
    vi.resetModules();

    const loggerError = vi.fn();
    const loggerWarn = vi.fn();

    vi.doMock('@config/logger', () => ({
      Logger: {
        error: loggerError,
        warn: loggerWarn,
      },
    }));

    vi.doMock('@config/cloudflare', () => ({
      Cloudflare: {
        getWorkersEnv: () => null,
      },
    }));

    vi.doMock('@config/env', () => ({
      Env: {
        NODE_ENV: 'development',
        REDIS_HOST: 'localhost',
        REDIS_PORT: 6379,
        USE_REDIS_PROXY: false,
        get: vi.fn((_k: string, fallback?: string) => fallback ?? ''),
        getInt: vi.fn((_k: string, fallback?: number) => fallback ?? 0),
      },
    }));

    const client = {
      get: vi
        .fn()
        .mockResolvedValueOnce(JSON.stringify({ hi: true }))
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce('not-json'),
      set: vi.fn(async () => 'OK'),
      del: vi.fn(async () => 1),
      flushdb: vi.fn(async () => 'OK'),
      exists: vi.fn(async () => 1),
    };

    vi.doMock('@config/workers', () => ({
      createRedisConnection: vi.fn(() => client),
    }));

    const { RedisDriver } = await import('@/cache/drivers/RedisDriver');
    const driver = RedisDriver.create();

    await expect(driver.get('k')).resolves.toEqual({ hi: true });
    await expect(driver.get('k2')).resolves.toBeNull();
    await expect(driver.get('k3')).resolves.toBeNull();
    expect(loggerError).toHaveBeenCalled();

    await expect(driver.has('k')).resolves.toBe(true);
    await expect(driver.set('k', { ok: true })).resolves.toBeUndefined();
    await expect(driver.delete('k')).resolves.toBeUndefined();
    await expect(driver.clear()).resolves.toBeUndefined();
  });

  it('exercises increment, decrement, and many (mget fallback) paths on ioredis client', async () => {
    vi.resetModules();

    const client = {
      get: vi.fn().mockResolvedValue('5'),
      mget: undefined, // force fallback to multiple get
      set: vi.fn(async () => 'OK'),
      del: vi.fn(async () => 1),
      flushdb: vi.fn(async () => 'OK'),
      exists: vi.fn(async () => 1),
      incrby: vi.fn(async (_k: string, a: number) => 5 + a),
      decrby: vi.fn(async (_k: string, a: number) => 5 - a),
    };

    vi.doMock('@config/workers', () => ({ createRedisConnection: vi.fn(() => client) }));
    vi.doMock('@config/env', () => ({
      Env: {
        NODE_ENV: 'development',
        REDIS_HOST: 'localhost',
        REDIS_PORT: 6379,
        USE_REDIS_PROXY: false,
        get: vi.fn((_k: string, f?: string) => f ?? ''),
        getInt: vi.fn((_k: string, f?: number) => f ?? 0),
      },
    }));
    vi.doMock('@config/cloudflare', () => ({ Cloudflare: { getWorkersEnv: () => null } }));
    vi.doMock('@config/logger', () => ({ Logger: { error: vi.fn(), warn: vi.fn() } }));

    const { RedisDriver } = await import('@/cache/drivers/RedisDriver');
    const driver = RedisDriver.create();

    await expect(driver.increment('ctr', 3)).resolves.toBe(8);
    await expect(driver.decrement('ctr', 2)).resolves.toBe(3);
    // get mocked to return string '5'; no mget so fallback map of gets + JSON.parse('5') === 5
    await expect(driver.many(['a', 'b'])).resolves.toEqual([5, 5]);
  });

  it('throws when ioredis init fails in workers/proxy mode and otherwise falls back', async () => {
    vi.resetModules();

    const loggerError = vi.fn();
    const loggerWarn = vi.fn();

    vi.doMock('@config/logger', () => ({
      Logger: {
        error: loggerError,
        warn: loggerWarn,
      },
    }));

    vi.doMock('@config/env', () => ({
      Env: {
        NODE_ENV: 'development',
        REDIS_HOST: 'localhost',
        REDIS_PORT: 6379,
        USE_REDIS_PROXY: true,
        get: vi.fn((_k: string, fallback?: string) => fallback ?? ''),
        getInt: vi.fn((_k: string, fallback?: number) => fallback ?? 0),
      },
    }));

    vi.doMock('@config/cloudflare', () => ({
      Cloudflare: {
        getWorkersEnv: () => ({}),
      },
    }));

    vi.doMock('@config/workers', () => ({
      createRedisConnection: () => {
        throw new Error('boom');
      },
    }));

    const { RedisDriver } = await import('@/cache/drivers/RedisDriver');
    expect(() => RedisDriver.create()).toThrow(/boom/);
    expect(loggerError).toHaveBeenCalled();
  });

  it('covers ioredis TTL branch + command failure logging', async () => {
    vi.resetModules();

    const loggerError = vi.fn();
    const loggerWarn = vi.fn();

    vi.doMock('@config/logger', () => ({
      Logger: {
        error: loggerError,
        warn: loggerWarn,
      },
    }));

    vi.doMock('@config/cloudflare', () => ({
      Cloudflare: {
        getWorkersEnv: () => null,
      },
    }));

    vi.doMock('@config/env', () => ({
      Env: {
        NODE_ENV: 'development',
        REDIS_HOST: 'localhost',
        REDIS_PORT: 6379,
        USE_REDIS_PROXY: false,
        get: vi.fn((_k: string, fallback?: string) => fallback ?? ''),
        getInt: vi.fn((_k: string, fallback?: number) => fallback ?? 0),
      },
    }));

    const client = {
      get: vi.fn(async () => JSON.stringify({ ok: true })),
      set: vi.fn(async () => {
        throw new Error('set-failed');
      }),
      del: vi.fn(async () => {
        throw new Error('del-failed');
      }),
      flushdb: vi.fn(async () => {
        throw new Error('flush-failed');
      }),
      exists: vi.fn(async () => {
        throw new Error('exists-failed');
      }),
    };

    vi.doMock('@config/workers', () => ({
      createRedisConnection: vi.fn(() => client),
    }));

    const { RedisDriver } = await import('@/cache/drivers/RedisDriver');
    const driver = RedisDriver.create();

    // TTL branch: client.set(key, json, 'EX', ttl)
    await expect(driver.set('k', { ok: true }, 60)).resolves.toBeUndefined();
    await expect(driver.delete('k')).resolves.toBeUndefined();
    await expect(driver.clear()).resolves.toBeUndefined();
    await expect(driver.has('k')).resolves.toBe(false);

    // Test getRedisClient() returns the client for ioredis driver
    expect(driver.getRedisClient()).toBe(client);

    expect(loggerError).toHaveBeenCalled();
  });
});
