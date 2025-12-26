/**
 * Cache Manager
 * Central cache management and driver resolution
 * Sealed namespace pattern - all exports through Cache namespace
 */

import { CacheDriver } from '@cache/CacheDriver';
import { KVDriver } from '@cache/drivers/KVDriver';
import { MemoryDriver } from '@cache/drivers/MemoryDriver';
import { MongoDriver } from '@cache/drivers/MongoDriver';
import { RedisDriver } from '@cache/drivers/RedisDriver';
import { Env } from '@config/env';
import { ErrorFactory } from '@exceptions/ZintrustError';

let instance: CacheDriver | undefined;

type DriverWithCreate = {
  create: () => CacheDriver;
};

type DriverConstructor = new () => CacheDriver;

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

function resolveDriver(): CacheDriver {
  const driverName = Env.CACHE_DRIVER;

  switch (driverName) {
    case 'kv':
      return buildDriver(KVDriver);
    case 'redis':
      return buildDriver(RedisDriver);
    case 'mongodb':
      return buildDriver(MongoDriver);
    case 'memory':
    default:
      return buildDriver(MemoryDriver);
  }
}

function getDriverInstance(): CacheDriver {
  instance ??= resolveDriver();
  return instance;
}

/**
 * Get an item from the cache
 */
const get = async <T>(key: string): Promise<T | null> => {
  const value = await getDriverInstance().get<T>(key);
  return value;
};

/**
 * Store an item in the cache
 */
const set = async <T>(key: string, value: T, ttl?: number): Promise<void> => {
  await getDriverInstance().set(key, value, ttl);
};

/**
 * Remove an item from the cache
 */
const del = async (key: string): Promise<void> => {
  await getDriverInstance().delete(key);
};

/**
 * Clear all items from the cache
 */
const clear = async (): Promise<void> => {
  await getDriverInstance().clear();
};

/**
 * Check if an item exists in the cache
 */
const has = async (key: string): Promise<boolean> => {
  const exists = await getDriverInstance().has(key);
  return exists;
};

/**
 * Get the underlying driver instance
 */
const getDriver = (): CacheDriver => {
  return getDriverInstance();
};

// Sealed namespace with cache functionality
export const Cache = Object.freeze({
  get,
  set,
  delete: del,
  clear,
  has,
  getDriver,
});

/**
 * Helper alias for cache
 */
export const cache = Cache;
