import { describe, expect, it, vi } from 'vitest';

describe('Cache external driver factories', () => {
  it('prefers CacheDriverRegistry factory over built-in driver', async () => {
    vi.resetModules();

    vi.doMock('@config/env', () => ({
      Env: {
        get CACHE_DRIVER() {
          return 'redis';
        },
        get: vi.fn((_key: string, defaultValue: string = '') => defaultValue),
        getInt: vi.fn((_key: string, defaultValue: number = 0) => defaultValue),
        getBool: vi.fn((_key: string, defaultValue: boolean = false) => defaultValue),
      },
    }));

    const driver = {
      get: vi.fn(async () => null),
      set: vi.fn(async () => undefined),
      delete: vi.fn(async () => undefined),
      clear: vi.fn(async () => undefined),
      has: vi.fn(async () => false),
    };

    const { CacheDriverRegistry } = await import('@cache/CacheDriverRegistry');
    CacheDriverRegistry.register('redis' as any, () => driver as any);

    const { Cache } = await import('@cache/Cache');

    expect(Cache.getDriver()).toBe(driver);

    await Cache.get('k');
    expect(driver.get).toHaveBeenCalledWith('zt:k');
  });
});
