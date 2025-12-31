/**
 * Cache Configuration
 * Caching drivers and settings
 * Sealed namespace for immutability
 */

import { Env } from '@zintrust/core';

type MemoryCacheDriverConfig = {
  driver: 'memory';
  ttl: number;
};

type RedisCacheDriverConfig = {
  driver: 'redis';
  host: string;
  port: number;
  ttl: number;
};

type MongoCacheDriverConfig = {
  driver: 'mongodb';
  uri: string;
  db: string;
  ttl: number;
};

type KvCacheDriverConfig = {
  driver: 'kv';
  ttl: number;
};

type CacheDriverConfig =
  | MemoryCacheDriverConfig
  | RedisCacheDriverConfig
  | MongoCacheDriverConfig
  | KvCacheDriverConfig;

type CacheDrivers = {
  memory: MemoryCacheDriverConfig;
  redis: RedisCacheDriverConfig;
  mongodb: MongoCacheDriverConfig;
  kv: KvCacheDriverConfig;
};

type CacheConfigInput = {
  default: string;
  drivers: CacheDrivers;
};

const getCacheDriver = (config: CacheConfigInput): CacheDriverConfig => {
  const defaultDriver = config.default;

  if (Object.hasOwn(config.drivers, defaultDriver)) {
    const driverName = defaultDriver as keyof CacheDrivers;
    return config.drivers[driverName];
  }

  return config.drivers.memory;
};

const cacheConfigObj = {
  /**
   * Default cache driver
   */
  default: Env.get('CACHE_DRIVER', 'memory'),

  /**
   * Cache drivers
   */
  drivers: {
    memory: {
      driver: 'memory' as const,
      ttl: Env.getInt('CACHE_MEMORY_TTL', 3600),
    },
    redis: {
      driver: 'redis' as const,
      host: Env.get('REDIS_HOST', 'localhost'),
      port: Env.getInt('REDIS_PORT', 6379),
      ttl: Env.getInt('CACHE_REDIS_TTL', 3600),
    },
    mongodb: {
      driver: 'mongodb' as const,
      uri: Env.get('MONGO_URI'),
      db: Env.get('MONGO_DB', 'zintrust_cache'),
      ttl: Env.getInt('CACHE_MONGO_TTL', 3600),
    },
    kv: {
      driver: 'kv' as const,
      ttl: Env.getInt('CACHE_KV_TTL', 3600),
    },
  },

  /**
   * Get cache driver config
   */
  getDriver(): CacheDriverConfig {
    return getCacheDriver(this);
  },

  /**
   * Key prefix for all cache keys
   */
  keyPrefix: Env.get('CACHE_KEY_PREFIX', 'zintrust:'),

  /**
   * Default cache TTL (seconds)
   */
  ttl: Env.getInt('CACHE_DEFAULT_TTL', 3600),
};

export const cacheConfig = Object.freeze(cacheConfigObj);
export type CacheConfig = typeof cacheConfig;
