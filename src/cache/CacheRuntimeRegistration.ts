import type { CacheConfig } from '@config/cache';

import { CacheDriverRegistry } from '@cache/CacheDriverRegistry';
import { KVDriver } from '@cache/drivers/KVDriver';
import { KVRemoteDriver } from '@cache/drivers/KVRemoteDriver';
import { MemoryDriver } from '@cache/drivers/MemoryDriver';
import { MongoDriver } from '@cache/drivers/MongoDriver';
import { RedisDriver } from '@cache/drivers/RedisDriver';

/**
 * Register cache drivers from runtime config.
 *
 * This follows the framework's config-driven availability pattern:
 * - Built-in driver factories are registered so config entries can reference them.
 * - Named cache stores are still resolved from `cacheConfig.drivers[storeName]`.
 * - Unknown store names throw when explicitly selected via `cacheConfig.getDriver(name)`.
 */
export function registerCachesFromRuntimeConfig(_config: CacheConfig): void {
  CacheDriverRegistry.register('memory', () => MemoryDriver.create());
  CacheDriverRegistry.register('redis', () => RedisDriver.create());
  CacheDriverRegistry.register('mongodb', () => MongoDriver.create());
  CacheDriverRegistry.register('kv', () => KVDriver.create());
  CacheDriverRegistry.register('kv-remote', () => KVRemoteDriver.create());
}
