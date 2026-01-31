import { beforeEach, describe, expect, it, vi } from 'vitest';

const createMockRedis = () => {
  let storedPayload: string | null = null;
  const redis = {
    get: vi.fn(async () => storedPayload),
    set: vi.fn(async (_key: string, value: string) => {
      storedPayload = value;
      return 'OK';
    }),
    del: vi.fn(async () => 1),
    scanStream: vi.fn(() => {
      return {
        on: (event: string, cb: (arg?: string[] | Error) => void) => {
          if (event === 'data') cb(['csrf:s1', 'csrf:s2']);
          if (event === 'end') cb();
          return undefined;
        },
      };
    }),
  };

  return {
    redis,
    getStored: () => storedPayload,
    setStored: (payload: string | null) => {
      storedPayload = payload;
    },
  };
};

describe('CsrfTokenManager (redis)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('generates, validates, refreshes, and invalidates tokens via redis', async () => {
    const { redis, getStored } = createMockRedis();
    const createRedisConnection = vi.fn(() => redis);

    vi.doMock('@config/workers', () => ({
      createRedisConnection,
    }));
    vi.doMock('@config/logger', () => ({
      Logger: {
        error: vi.fn(),
        warn: vi.fn(),
        info: vi.fn(),
        debug: vi.fn(),
      },
    }));

    const { CsrfTokenManager } = await import('@security/CsrfTokenManager');

    const manager = CsrfTokenManager.create({
      store: 'redis',
      keyPrefix: 'csrf:',
      tokenLength: 4,
      tokenTtlMs: 10_000,
    });

    const token = await manager.generateToken('session-1');
    expect(token).toBeDefined();
    expect(createRedisConnection).toHaveBeenCalledTimes(1);

    const isValid = await manager.validateToken('session-1', token);
    expect(isValid).toBe(true);

    const refreshed = await manager.refreshToken('session-1');
    expect(refreshed).toBe(token);
    expect(redis.set).toHaveBeenCalled();

    await manager.invalidateToken('session-1');
    expect(redis.del).toHaveBeenCalledWith('csrf:session-1');

    const stored = getStored();
    expect(stored).toBeTypeOf('string');
  });

  it('returns false and deletes expired tokens', async () => {
    const { redis, setStored } = createMockRedis();
    const createRedisConnection = vi.fn(() => redis);

    vi.doMock('@config/workers', () => ({
      createRedisConnection,
    }));
    vi.doMock('@config/logger', () => ({
      Logger: {
        error: vi.fn(),
        warn: vi.fn(),
        info: vi.fn(),
        debug: vi.fn(),
      },
    }));

    const { CsrfTokenManager } = await import('@security/CsrfTokenManager');

    const expired = {
      token: 'expired-token',
      sessionId: 'session-expired',
      createdAt: Date.now() - 20_000,
      expiresAt: Date.now() - 10_000,
    };
    setStored(JSON.stringify(expired));

    const manager = CsrfTokenManager.create({
      store: 'redis',
      keyPrefix: 'csrf:',
      tokenLength: 4,
      tokenTtlMs: 1_000,
    });

    const isValid = await manager.validateToken('session-expired', 'expired-token');
    expect(isValid).toBe(false);
    expect(redis.del).toHaveBeenCalledWith('csrf:session-expired');
  });

  it('returns null for missing or expired refresh and supports clear/count', async () => {
    const { redis, setStored } = createMockRedis();
    const createRedisConnection = vi.fn(() => redis);

    vi.doMock('@config/workers', () => ({
      createRedisConnection,
    }));
    vi.doMock('@config/logger', () => ({
      Logger: {
        error: vi.fn(),
        warn: vi.fn(),
        info: vi.fn(),
        debug: vi.fn(),
      },
    }));

    const { CsrfTokenManager } = await import('@security/CsrfTokenManager');

    const manager = CsrfTokenManager.create({
      store: 'redis',
      keyPrefix: 'csrf:',
      tokenLength: 4,
      tokenTtlMs: 1_000,
    });

    setStored(null);
    expect(await manager.refreshToken('missing')).toBeNull();

    const expired = {
      token: 'old-token',
      sessionId: 'old-session',
      createdAt: Date.now() - 20_000,
      expiresAt: Date.now() - 10_000,
    };
    setStored(JSON.stringify(expired));

    expect(await manager.refreshToken('old-session')).toBeNull();
    expect(redis.del).toHaveBeenCalledWith('csrf:old-session');

    expect(await manager.getTokenCount()).toBe(2);
    await manager.clear();
    expect(redis.del).toHaveBeenCalledWith('csrf:s1', 'csrf:s2');

    expect(await manager.cleanup()).toBe(0);
  });
});
