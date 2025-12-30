import { describe, expect, it, vi } from 'vitest';

type DriverImpl = {
  get: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  clear: ReturnType<typeof vi.fn>;
  has: ReturnType<typeof vi.fn>;
};

function createDriverImpl(): DriverImpl {
  return {
    get: vi.fn(async () => 'value'),
    set: vi.fn(async () => undefined),
    delete: vi.fn(async () => undefined),
    clear: vi.fn(async () => undefined),
    has: vi.fn(async () => true),
  };
}

describe('Cache.buildDriver internal branches', () => {
  it('uses driver.create() when export has create()', async () => {
    vi.resetModules();

    const memoryImpl = createDriverImpl();
    const create = vi.fn(() => memoryImpl);

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

    // Ensure all driver modules are safe to import.
    vi.doMock('@cache/drivers/MemoryDriver', () => ({ MemoryDriver: { create } }));
    vi.doMock('@cache/drivers/KVDriver', () => ({
      KVDriver: { create: vi.fn(() => createDriverImpl()) },
    }));
    vi.doMock('@cache/drivers/RedisDriver', () => ({
      RedisDriver: { create: vi.fn(() => createDriverImpl()) },
    }));
    vi.doMock('@cache/drivers/MongoDriver', () => ({
      MongoDriver: { create: vi.fn(() => createDriverImpl()) },
    }));

    const mod = await import('@cache/Cache');

    await mod.Cache.get('k');
    expect(create).toHaveBeenCalledTimes(1);
    expect(memoryImpl.get).toHaveBeenCalledWith('k');
  });

  it('instantiates the export when it is a constructor function', async () => {
    vi.resetModules();

    const memoryImpl = createDriverImpl();
    const MemoryDriver = function (this: any) {
      return memoryImpl;
    } as any;

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

    vi.doMock('@cache/drivers/MemoryDriver', () => ({ MemoryDriver }));
    vi.doMock('@cache/drivers/KVDriver', () => ({
      KVDriver: { create: vi.fn(() => createDriverImpl()) },
    }));
    vi.doMock('@cache/drivers/RedisDriver', () => ({
      RedisDriver: { create: vi.fn(() => createDriverImpl()) },
    }));
    vi.doMock('@cache/drivers/MongoDriver', () => ({
      MongoDriver: { create: vi.fn(() => createDriverImpl()) },
    }));

    const mod = await import('@cache/Cache');

    await mod.Cache.get('k');
    expect(memoryImpl.get).toHaveBeenCalledWith('k');
  });

  it('throws when driver export is invalid', async () => {
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

    vi.doMock('@cache/drivers/MemoryDriver', () => ({ MemoryDriver: 123 }));
    vi.doMock('@cache/drivers/KVDriver', () => ({
      KVDriver: { create: vi.fn(() => createDriverImpl()) },
    }));
    vi.doMock('@cache/drivers/RedisDriver', () => ({
      RedisDriver: { create: vi.fn(() => createDriverImpl()) },
    }));
    vi.doMock('@cache/drivers/MongoDriver', () => ({
      MongoDriver: { create: vi.fn(() => createDriverImpl()) },
    }));

    const mod = await import('@cache/Cache');

    await expect(mod.Cache.get('k')).rejects.toThrow(/Invalid cache driver export/);
  });
});
