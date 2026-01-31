import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('LockProvider.closeLockProvider warn branch', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('logs a warning when quit throws', async () => {
    const warnSpy = vi.fn();
    vi.doMock('@config/logger', () => ({
      Logger: { warn: warnSpy, info: vi.fn(), error: vi.fn(), debug: vi.fn() },
    }));

    const fakeRedis: any = {
      set: vi.fn().mockResolvedValue('OK'),
      quit: vi.fn().mockRejectedValue(new Error('quit failed')),
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

    const LockProvider = await import('@/tools/queue/LockProvider');

    const provider = LockProvider.createRedisLockProvider({
      prefix: 'p:',
      defaultTtl: 1000,
    } as any);
    const lock = await provider.acquire('key1');
    expect(lock.acquired).toBe(true);

    await LockProvider.closeLockProvider();
    expect(warnSpy).toHaveBeenCalledWith(
      'Error closing Redis lock provider connection',
      expect.any(Error)
    );
  });
});
