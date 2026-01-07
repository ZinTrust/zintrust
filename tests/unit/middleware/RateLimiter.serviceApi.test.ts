import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const createReqResNext = async (): Promise<{
  req: unknown;
  res: { setHeader: any; setStatus: any; json: any };
  next: any;
  headers: Record<string, string>;
}> => {
  const headers: Record<string, string> = {};

  const req = {
    getHeader: vi.fn(),
    getRaw: vi.fn(() => ({ socket: { remoteAddress: '127.0.0.1' } })),
  };

  const res = {
    setHeader: vi.fn((name: string, value: string | string[]) => {
      headers[name.toLowerCase()] = Array.isArray(value) ? value.join(',') : value;
      return res;
    }),
    setStatus: vi.fn().mockReturnThis(),
    json: vi.fn(),
  };

  const next = vi.fn().mockResolvedValue(undefined);

  return { req, res, next, headers };
};

describe('RateLimiter generated service API', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('attempt/tooManyAttempts/till/clear should behave correctly (memory store)', async () => {
    vi.resetModules();

    const { RateLimiter } = await import('@/middleware/RateLimiter');
    RateLimiter.configure({ store: 'memory' });

    const key = 'login:127.0.0.1';

    expect(await RateLimiter.tooManyAttempts(key, 2)).toBe(false);
    expect(await RateLimiter.till(key)).toBe(0);

    expect(await RateLimiter.attempt(key, 2, 60)).toBe(true);
    expect(await RateLimiter.attempt(key, 2, 60)).toBe(true);

    expect(await RateLimiter.tooManyAttempts(key, 2)).toBe(true);
    const retryAfter = await RateLimiter.till(key);
    expect(retryAfter).toBeGreaterThan(0);

    expect(await RateLimiter.attempt(key, 2, 60)).toBe(false);

    await RateLimiter.clear(key);
    expect(await RateLimiter.tooManyAttempts(key, 2)).toBe(false);
    expect(await RateLimiter.till(key)).toBe(0);

    // Expiration should naturally remove the state.
    expect(await RateLimiter.attempt(key, 1, 60)).toBe(true);
    vi.advanceTimersByTime(61_000);
    expect(await RateLimiter.tooManyAttempts(key, 1)).toBe(false);
    expect(await RateLimiter.till(key)).toBe(0);
  });

  it('memory store should delete expired entry on get without waiting for periodic cleanup', async () => {
    vi.resetModules();

    const { RateLimiter } = await import('@/middleware/RateLimiter');
    RateLimiter.configure({ store: 'memory' });

    const key = 'expired-without-cleanup';

    // Create state at t=0 with a 1s window.
    expect(await RateLimiter.attempt(key, 1, 1)).toBe(true);

    // Advance past resetTime but keep < 60s so createMemoryStore.cleanupExpired() won't run.
    vi.advanceTimersByTime(2_000);

    // This call triggers createMemoryStore.get() expired branch (entries.delete + return null).
    expect(await RateLimiter.tooManyAttempts(key, 1)).toBe(false);
  });
});

describe('RateLimiter store delegation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('configure({store:"redis"}) should delegate to Cache.store("redis") for service API', async () => {
    vi.resetModules();

    const get = vi.fn().mockResolvedValue(null);
    const set = vi.fn().mockResolvedValue(undefined);
    const del = vi.fn().mockResolvedValue(undefined);
    const store = { get, set, delete: del };

    const storeFactory = vi.fn(() => store);

    vi.doMock('@cache/Cache', () => ({
      Cache: {
        store: storeFactory,
      },
    }));

    const { RateLimiter } = await import('@/middleware/RateLimiter');

    RateLimiter.configure({ store: 'redis' });
    const allowed = await RateLimiter.attempt('k', 1, 60);

    expect(allowed).toBe(true);
    expect(storeFactory).toHaveBeenCalledWith('redis');
    expect(set).toHaveBeenCalled();

    const [, , ttlSeconds] = set.mock.calls[0];
    expect(ttlSeconds).toBe(60);
  });

  it('clear() should delegate to the selected Cache store delete() implementation', async () => {
    vi.resetModules();

    const get = vi.fn().mockResolvedValue(null);
    const set = vi.fn().mockResolvedValue(undefined);
    const del = vi.fn().mockResolvedValue(undefined);
    const store = { get, set, delete: del };

    const storeFactory = vi.fn(() => store);

    vi.doMock('@cache/Cache', () => ({
      Cache: {
        store: storeFactory,
      },
    }));

    const { RateLimiter } = await import('@/middleware/RateLimiter');

    RateLimiter.configure({ store: 'redis' });
    await RateLimiter.clear('k');

    expect(storeFactory).toHaveBeenCalledWith('redis');
    expect(del).toHaveBeenCalledTimes(1);
  });

  it('RateLimiter.create({store:"redis"}) should delegate to Cache.store("redis") for middleware', async () => {
    vi.resetModules();

    const get = vi.fn().mockResolvedValue(null);
    const set = vi.fn().mockResolvedValue(undefined);
    const del = vi.fn().mockResolvedValue(undefined);
    const store = { get, set, delete: del };

    const storeFactory = vi.fn(() => store);

    vi.doMock('@cache/Cache', () => ({
      Cache: {
        store: storeFactory,
      },
    }));

    const { RateLimiter } = await import('@/middleware/RateLimiter');
    const { req, res, next } = await createReqResNext();

    const middleware = RateLimiter.create({ store: 'redis', max: 1, windowMs: 1000 });
    await middleware(req as any, res as any, next);

    expect(storeFactory).toHaveBeenCalledWith('redis');
    expect(set).toHaveBeenCalled();

    const [, , ttlSeconds] = set.mock.calls[0];
    expect(ttlSeconds).toBe(1);
  });

  it('configure({store:"db"}) should delegate to Cache.store("mongodb") for service API', async () => {
    vi.resetModules();

    const get = vi.fn().mockResolvedValue(null);
    const set = vi.fn().mockResolvedValue(undefined);
    const del = vi.fn().mockResolvedValue(undefined);
    const store = { get, set, delete: del };

    const storeFactory = vi.fn(() => store);

    vi.doMock('@cache/Cache', () => ({
      Cache: {
        store: storeFactory,
      },
    }));

    const { RateLimiter } = await import('@/middleware/RateLimiter');

    RateLimiter.configure({ store: 'db' });
    const allowed = await RateLimiter.attempt('k', 1, 60);

    expect(allowed).toBe(true);
    expect(storeFactory).toHaveBeenCalledWith('mongodb');
    expect(set).toHaveBeenCalled();
  });

  it('RateLimiter.create({store:"db"}) should delegate to Cache.store("mongodb") for middleware', async () => {
    vi.resetModules();

    const get = vi.fn().mockResolvedValue(null);
    const set = vi.fn().mockResolvedValue(undefined);
    const del = vi.fn().mockResolvedValue(undefined);
    const store = { get, set, delete: del };

    const storeFactory = vi.fn(() => store);

    vi.doMock('@cache/Cache', () => ({
      Cache: {
        store: storeFactory,
      },
    }));

    const { RateLimiter } = await import('@/middleware/RateLimiter');
    const { req, res, next } = await createReqResNext();

    const middleware = RateLimiter.create({ store: 'db', max: 1, windowMs: 1000 });
    await middleware(req as any, res as any, next);

    expect(storeFactory).toHaveBeenCalledWith('mongodb');
    expect(set).toHaveBeenCalled();
  });
});
