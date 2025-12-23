/**
 * Cache Configuration
 * Caching drivers and settings
 * Sealed namespace for immutability
 */

import { Env } from '@config/env';

type MemoryCacheDriverConfig = {
  driver: 'memory';
  ttl: number;
};

type RedisCacheDriverConfig = {
  driver: 'redis';
  host: string;
  port: number;
  password: string | undefined;
  database: number;
  ttl: number;
};

type MemcachedCacheDriverConfig = {
  driver: 'memcached';
  servers: string[];
  ttl: number;
};

type FileCacheDriverConfig = {
  driver: 'file';
  path: string;
  ttl: number;
};

type CacheDriverConfig =
  | MemoryCacheDriverConfig
  | RedisCacheDriverConfig
  | MemcachedCacheDriverConfig
  | FileCacheDriverConfig;

type CacheDrivers = {
  memory: MemoryCacheDriverConfig;
  redis: RedisCacheDriverConfig;
  memcached: MemcachedCacheDriverConfig;
  file: FileCacheDriverConfig;
};

type CacheConfigInput = {
  default: string;
  drivers: CacheDrivers;
};

const getCacheDriver = (config: CacheConfigInput): CacheDriverConfig => {
  const defaultDriver = config.default;

  if (Object.prototype.hasOwnProperty.call(config.drivers, defaultDriver)) {
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
      password: Env.get('REDIS_PASSWORD'),
      database: Env.getInt('REDIS_DB', 0),
      ttl: Env.getInt('CACHE_REDIS_TTL', 3600),
    },
    memcached: {
      driver: 'memcached' as const,
      servers: Env.get('MEMCACHED_SERVERS', 'localhost:11211').split(','),
      ttl: Env.getInt('CACHE_MEMCACHED_TTL', 3600),
    },
    file: {
      driver: 'file' as const,
      path: Env.get('CACHE_FILE_PATH', 'storage/cache'),
      ttl: Env.getInt('CACHE_FILE_TTL', 3600),
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
