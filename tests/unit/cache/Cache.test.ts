import { beforeEach, describe, expect, it, vi } from 'vitest';

type Fn = ReturnType<typeof vi.fn>;

type DriverImpl = {
  get: Fn;
  set: Fn;
  delete: Fn;
  clear: Fn;
  has: Fn;
};

let cacheDriverName = 'memory';

let kvImpl: DriverImpl;
let redisImpl: DriverImpl;
let mongoImpl: DriverImpl;
let memoryImpl: DriverImpl;

let kvConstructed = 0;
let redisConstructed = 0;
let mongoConstructed = 0;
let memoryConstructed = 0;

const KVDriver = function (this: any) {
  kvConstructed += 1;
  return kvImpl;
} as any;

const RedisDriver = function (this: any) {
  redisConstructed += 1;
  return redisImpl;
} as any;

const MongoDriver = function (this: any) {
  mongoConstructed += 1;
  return mongoImpl;
} as any;

const MemoryDriver = function (this: any) {
  memoryConstructed += 1;
  return memoryImpl;
} as any;

vi.mock('@cache/drivers/KVDriver', () => ({
  KVDriver,
}));

vi.mock('@cache/drivers/RedisDriver', () => ({
  RedisDriver,
}));

vi.mock('@cache/drivers/MongoDriver', () => ({
  MongoDriver,
}));

vi.mock('@cache/drivers/MemoryDriver', () => ({
  MemoryDriver,
}));

vi.mock('@config/env', () => ({
  Env: {
    get CACHE_DRIVER() {
      return cacheDriverName;
    },

    get: vi.fn((key: string, defaultValue: string = '') => {
      String(key);
      return defaultValue;
    }),

    getInt: vi.fn((key: string, defaultValue: number = 0) => {
      String(key);
      return defaultValue;
    }),

    getBool: vi.fn((key: string, defaultValue: boolean = false) => {
      String(key);
      return defaultValue;
    }),
  },
}));

function createDriverImpl(): DriverImpl {
  return {
    get: vi.fn(async () => 'value'),
    set: vi.fn(async () => undefined),
    delete: vi.fn(async () => undefined),
    clear: vi.fn(async () => undefined),
    has: vi.fn(async () => true),
  };
}

describe('Cache', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    cacheDriverName = 'memory';

    kvConstructed = 0;
    redisConstructed = 0;
    mongoConstructed = 0;
    memoryConstructed = 0;

    kvImpl = createDriverImpl();
    redisImpl = createDriverImpl();
    mongoImpl = createDriverImpl();
    memoryImpl = createDriverImpl();
  });

  it('uses KV driver when Env.CACHE_DRIVER=kv', async () => {
    cacheDriverName = 'kv';
    const mod = await import('@cache/Cache');

    await mod.Cache.set('k', 'v', 1);
    expect(kvImpl.set).toHaveBeenCalledWith('k', 'v', 1);

    const value = await mod.Cache.get<string>('k');
    expect(value).toBe('value');
    expect(kvImpl.get).toHaveBeenCalledWith('k');

    await mod.Cache.delete('k');
    expect(kvImpl.delete).toHaveBeenCalledWith('k');

    await mod.Cache.clear();
    expect(kvImpl.clear).toHaveBeenCalledTimes(1);

    const exists = await mod.Cache.has('k');
    expect(exists).toBe(true);
    expect(kvImpl.has).toHaveBeenCalledWith('k');

    const driver = mod.Cache.getDriver();
    expect(driver).toBe(kvImpl);

    expect(kvConstructed).toBe(1);
    expect(redisConstructed).toBe(0);
    expect(mongoConstructed).toBe(0);
    expect(memoryConstructed).toBe(0);
  });

  it('uses Redis driver when Env.CACHE_DRIVER=redis', async () => {
    cacheDriverName = 'redis';
    const mod = await import('@cache/Cache');

    await mod.Cache.get('k');

    expect(redisConstructed).toBe(1);
    expect(kvConstructed).toBe(0);
    expect(mongoConstructed).toBe(0);
    expect(memoryConstructed).toBe(0);
  });

  it('uses Mongo driver when Env.CACHE_DRIVER=mongodb', async () => {
    cacheDriverName = 'mongodb';
    const mod = await import('@cache/Cache');

    await mod.Cache.get('k');

    expect(mongoConstructed).toBe(1);
    expect(kvConstructed).toBe(0);
    expect(redisConstructed).toBe(0);
    expect(memoryConstructed).toBe(0);
  });

  it('uses Memory driver when Env.CACHE_DRIVER=memory', async () => {
    cacheDriverName = 'memory';
    const mod = await import('@cache/Cache');

    await mod.Cache.get('k');

    expect(memoryConstructed).toBe(1);
    expect(kvConstructed).toBe(0);
    expect(redisConstructed).toBe(0);
    expect(mongoConstructed).toBe(0);
  });

  it('defaults to Memory driver when Env.CACHE_DRIVER is unknown', async () => {
    cacheDriverName = 'nope';
    const mod = await import('@cache/Cache');

    await mod.Cache.get('k');

    expect(memoryConstructed).toBe(1);
  });

  it('reuses the same driver instance (singleton)', async () => {
    cacheDriverName = 'redis';
    const mod = await import('@cache/Cache');

    await mod.Cache.get('a');
    await mod.Cache.get('b');
    expect(redisConstructed).toBe(1);

    cacheDriverName = 'kv';
    await mod.Cache.get('c');
    expect(redisConstructed).toBe(1);
    expect(kvConstructed).toBe(0);
  });

  it('Cache object and cache alias forward to functions', async () => {
    cacheDriverName = 'kv';
    const mod = await import('@cache/Cache');

    await mod.Cache.set('a', 'b');
    await mod.cache.set('c', 'd');
    await mod.Cache.delete('a');

    expect(kvImpl.set).toHaveBeenCalledWith('a', 'b', undefined);
    expect(kvImpl.set).toHaveBeenCalledWith('c', 'd', undefined);
    expect(kvImpl.delete).toHaveBeenCalledWith('a');
  });
});
