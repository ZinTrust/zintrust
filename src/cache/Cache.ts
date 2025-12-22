/**
 * Cache Manager
 * Central cache management and driver resolution
 */

import { CacheDriver } from '@cache/CacheDriver';
import { KVDriver } from '@cache/drivers/KVDriver';
import { MemoryDriver } from '@cache/drivers/MemoryDriver';
import { MongoDriver } from '@cache/drivers/MongoDriver';
import { RedisDriver } from '@cache/drivers/RedisDriver';
import { Env } from '@config/env';

let instance: CacheDriver | undefined;

function resolveDriver(): CacheDriver {
  const driverName = Env.CACHE_DRIVER;

  switch (driverName) {
    case 'kv':
      return new KVDriver();
    case 'redis':
      return new RedisDriver();
    case 'mongodb':
      return new MongoDriver();
    case 'memory':
    default:
      return new MemoryDriver();
  }
}

function getDriverInstance(): CacheDriver {
  instance ??= resolveDriver();
  return instance;
}

/**
 * Get an item from the cache
 */
export async function get<T>(key: string): Promise<T | null> {
  return getDriverInstance().get<T>(key);
}

/**
 * Store an item in the cache
 */
export async function set<T>(key: string, value: T, ttl?: number): Promise<void> {
  await getDriverInstance().set(key, value, ttl);
}

/**
 * Remove an item from the cache
 */
export async function del(key: string): Promise<void> {
  await getDriverInstance().delete(key);
}

/**
 * Clear all items from the cache
 */
export async function clear(): Promise<void> {
  await getDriverInstance().clear();
}

/**
 * Check if an item exists in the cache
 */
export async function has(key: string): Promise<boolean> {
  return getDriverInstance().has(key);
}

/**
 * Get the underlying driver instance
 */
export function getDriver(): CacheDriver {
  return getDriverInstance();
}

export const Cache = {
  get,
  set,
  delete: del,
  clear,
  has,
  getDriver,
};

/**
 * Helper function to use cache
 */
export const cache = Cache;
