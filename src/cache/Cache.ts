/* eslint-disable @typescript-eslint/require-await */
/**
 * Cache Manager
 * Central cache management and driver resolution
 * Sealed namespace pattern - all exports through Cache namespace
 */

import type { CacheDriver } from '@cache/CacheDriver';
import { CacheDriverRegistry } from '@cache/CacheDriverRegistry';
import { KVDriver } from '@cache/drivers/KVDriver';
import { KVRemoteDriver } from '@cache/drivers/KVRemoteDriver';
import { MemoryDriver } from '@cache/drivers/MemoryDriver';
import { MongoDriver } from '@cache/drivers/MongoDriver';
import { RedisDriver } from '@cache/drivers/RedisDriver';
import { cacheConfig } from '@config/cache';
import { SystemDebuggerBridge } from '@/debugger/SystemDebuggerBridge';
import { Env } from '@config/env';
import { ErrorFactory } from '@exceptions/ZintrustError';

const instances: Map<string, CacheDriver> = new Map();

/**
 * Auto-prefix cache keys with 'zt:' if not already prefixed
 */
function autoPrefixKey(key: string): string {
  return key.startsWith('zt:') ? key : `zt:${key}`;
}

type DriverWithCreate = {
  create: () => CacheDriver;
};

type DriverConstructor = new () => CacheDriver;

function createNoOpDriver(): CacheDriver {
  return {
    get: async <T>(): Promise<T | null> => null,
    set: async (): Promise<void> => {},
    delete: async (): Promise<void> => {},
    clear: async (): Promise<void> => {},
    has: async (): Promise<boolean> => false,
  };
}

function buildDriver(driver: unknown): CacheDriver {
  const maybeCreate = (driver as Partial<DriverWithCreate>).create;
  if (typeof maybeCreate === 'function') {
    return maybeCreate();
  }

  if (typeof driver === 'function') {
    return new (driver as unknown as DriverConstructor)();
  }

  throw ErrorFactory.createGeneralError('Invalid cache driver export');
}

function resolveDriver(storeName?: string): CacheDriver {
  const cacheEnabledRaw = Env.get('CACHE_ENABLED', 'true').trim().toLowerCase();
  const cacheEnabled = !(
    cacheEnabledRaw === 'false' ||
    cacheEnabledRaw === '0' ||
    cacheEnabledRaw === 'no'
  );
  if (!cacheEnabled) {
    return createNoOpDriver();
  }

  const driverConfig = cacheConfig.getDriver(storeName);

  const externalFactory = CacheDriverRegistry.get(driverConfig.driver);
  if (externalFactory !== undefined) {
    return externalFactory(driverConfig);
  }

  const driverName = driverConfig.driver;

  switch (driverName) {
    case 'kv':
      return buildDriver(KVDriver);
    case 'kv-remote':
      return buildDriver(KVRemoteDriver);
    case 'redis':
      return buildDriver(RedisDriver);
    case 'mongodb':
      return buildDriver(MongoDriver);
    case 'memory':
    default:
      return buildDriver(MemoryDriver);
  }
}

function getDriverInstance(storeName?: string): CacheDriver {
  const normalizedSelection = String(storeName ?? '')
    .trim()
    .toLowerCase();
  const resolvedKey = normalizedSelection.length > 0 ? normalizedSelection : 'default';

  const existing = instances.get(resolvedKey);
  if (existing !== undefined) return existing;

  const selector = resolvedKey === 'default' ? undefined : resolvedKey;
  const created = resolveDriver(selector);
  instances.set(resolvedKey, created);
  return created;
}

/**
 * Get an item from the cache
 */
const get = async <T>(key: string): Promise<T | null> => {
  const prefixedKey = autoPrefixKey(key);
  const startedAt = Date.now();
  const value = await getDriverInstance().get<T>(prefixedKey);
  SystemDebuggerBridge.emitCache('get', prefixedKey, Date.now() - startedAt, value !== null);
  return value;
};

/**
 * Store an item in the cache
 */
const set = async <T>(key: string, value: T, ttl?: number): Promise<void> => {
  const prefixedKey = autoPrefixKey(key);
  const startedAt = Date.now();
  await getDriverInstance().set(prefixedKey, value, ttl);
  SystemDebuggerBridge.emitCache('set', prefixedKey, Date.now() - startedAt);
};

/**
 * Remove an item from the cache
 */
const del = async (key: string): Promise<void> => {
  const prefixedKey = autoPrefixKey(key);
  const startedAt = Date.now();
  await getDriverInstance().delete(prefixedKey);
  SystemDebuggerBridge.emitCache('delete', prefixedKey, Date.now() - startedAt);
};

/**
 * Clear all items from the cache
 */
const clear = async (): Promise<void> => {
  const startedAt = Date.now();
  await getDriverInstance().clear();
  SystemDebuggerBridge.emitCache('clear', 'zt:*', Date.now() - startedAt);
};

/**
 * Check if an item exists in the cache
 */
const has = async (key: string): Promise<boolean> => {
  const prefixedKey = autoPrefixKey(key);
  const startedAt = Date.now();
  const exists = await getDriverInstance().has(prefixedKey);
  SystemDebuggerBridge.emitCache('has', prefixedKey, Date.now() - startedAt, exists);
  return exists;
};

/**
 * Get the underlying driver instance
 */
const getDriver = (): CacheDriver => {
  return getDriverInstance();
};

type CacheStore = Readonly<{
  get: <T>(key: string) => Promise<T | null>;
  set: <T>(key: string, value: T, ttl?: number) => Promise<void>;
  delete: (key: string) => Promise<void>;
  clear: () => Promise<void>;
  has: (key: string) => Promise<boolean>;
  getDriver: () => CacheDriver;
}>;

const store = (name?: string): CacheStore => {
  const getFromStore = async <T>(key: string): Promise<T | null> => {
    const prefixedKey = autoPrefixKey(key);
    const startedAt = Date.now();
    const value = await getDriverInstance(name).get<T>(prefixedKey);
    SystemDebuggerBridge.emitCache('get', prefixedKey, Date.now() - startedAt, value !== null);
    return value;
  };

  const setInStore = async <T>(key: string, value: T, ttl?: number): Promise<void> => {
    const prefixedKey = autoPrefixKey(key);
    const startedAt = Date.now();
    await getDriverInstance(name).set(prefixedKey, value, ttl);
    SystemDebuggerBridge.emitCache('set', prefixedKey, Date.now() - startedAt);
  };

  const delFromStore = async (key: string): Promise<void> => {
    const prefixedKey = autoPrefixKey(key);
    const startedAt = Date.now();
    await getDriverInstance(name).delete(prefixedKey);
    SystemDebuggerBridge.emitCache('delete', prefixedKey, Date.now() - startedAt);
  };

  const clearStore = async (): Promise<void> => {
    const startedAt = Date.now();
    await getDriverInstance(name).clear();
    SystemDebuggerBridge.emitCache(
      'clear',
      `store:${String(name ?? 'default')}`,
      Date.now() - startedAt
    );
  };

  const hasInStore = async (key: string): Promise<boolean> => {
    const prefixedKey = autoPrefixKey(key);
    const startedAt = Date.now();
    const exists = await getDriverInstance(name).has(prefixedKey);
    SystemDebuggerBridge.emitCache('has', prefixedKey, Date.now() - startedAt, exists);
    return exists;
  };

  const getStoreDriver = (): CacheDriver => {
    return getDriverInstance(name);
  };

  return Object.freeze({
    get: getFromStore,
    set: setInStore,
    delete: delFromStore,
    clear: clearStore,
    has: hasInStore,
    getDriver: getStoreDriver,
  });
};

const reset = (): void => {
  instances.clear();
};

// Sealed namespace with cache functionality
export const Cache = Object.freeze({
  get,
  set,
  delete: del,
  clear,
  has,
  getDriver,
  store,
  reset,
});

/**
 * Helper alias for cache
 */
export const cache = Cache;
