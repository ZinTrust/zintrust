import { describe, expect, it, vi } from 'vitest';

describe('Cache named stores', () => {
  it('throws when selecting an unknown store', async () => {
    vi.resetModules();

    vi.doMock('@config/env', () => ({
      Env: {
        get CACHE_DRIVER() {
          return 'memory';
        },
        get: vi.fn((_key: string, defaultValue: string = '') => defaultValue),
        getInt: vi.fn((_key: string, defaultValue: number = 0) => defaultValue),
        getBool: vi.fn((_key: string, defaultValue: boolean = false) => defaultValue),
      },
    }));

    const mod = await import('../../../src/cache/Cache');

    await expect(mod.Cache.store('nope').get('k')).rejects.toThrow(/Cache store not configured/);
  });

  it("treats 'default' as an alias of the configured default", async () => {
    vi.resetModules();

    vi.doMock('@config/env', () => ({
      Env: {
        get CACHE_DRIVER() {
          return 'memory';
        },
        get: vi.fn((_key: string, defaultValue: string = '') => defaultValue),
        getInt: vi.fn((_key: string, defaultValue: number = 0) => defaultValue),
        getBool: vi.fn((_key: string, defaultValue: boolean = false) => defaultValue),
      },
    }));

    const mod = await import('../../../src/cache/Cache');

    await mod.Cache.set('k', 'v');
    const value = await mod.Cache.store('default').get('k');
    expect(value).toBe('v');
  });
});
