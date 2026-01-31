import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('LockProvider.closeLockProvider', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('calls quit on redis client and clears singleton', async () => {
    const fakeRedis: any = {
      set: vi.fn().mockResolvedValue('OK'),
      quit: vi.fn().mockResolvedValue(undefined),
      incr: vi.fn().mockResolvedValue(1),
      pttl: vi.fn().mockResolvedValue(1000),
      del: vi.fn().mockResolvedValue(1),
      pexpire: vi.fn().mockResolvedValue(1),
      scan: vi.fn().mockResolvedValue(['0', []]),
    };

    vi.doMock('@config/queue', () => ({
      createBaseDrivers: () => ({
        redis: { host: '127.0.0.1', port: 6379, password: '', database: 0 },
      }),
    }));

    vi.doMock('@config/workers', () => ({
      createRedisConnection: () => fakeRedis,
    }));

    // import after mocking so module picks up the mocks
    const LockProvider = await import('@/tools/queue/LockProvider');

    // create a redis provider and use it to ensure redisClient is initialized
    const provider = LockProvider.createRedisLockProvider({
      prefix: 'p:',
      defaultTtl: 1000,
    } as any);
    // call acquire to force getRedisClient() to run and set the module-scoped client
    const lock = await provider.acquire('key1');
    expect(lock.acquired).toBe(true);

    // now call closeLockProvider and ensure quit was called
    await LockProvider.closeLockProvider();
    expect(fakeRedis.quit).toHaveBeenCalled();

    // calling again should be a no-op and not throw
    await LockProvider.closeLockProvider();
    expect(fakeRedis.quit).toHaveBeenCalledTimes(1);
  });
});
