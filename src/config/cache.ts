/**
 * Cache Configuration
 * Caching drivers and settings
 */

import { Env } from '@config/env';

export const cacheConfig = {
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
  getDriver() {
    const driverName = this.default as keyof typeof this.drivers;
    return this.drivers[driverName];
  },

  /**
   * Key prefix for all cache keys
   */
  keyPrefix: Env.get('CACHE_KEY_PREFIX', 'zintrust:'),

  /**
   * Default cache TTL (seconds)
   */
  ttl: Env.getInt('CACHE_DEFAULT_TTL', 3600),
} as const;

export type CacheConfig = typeof cacheConfig;
