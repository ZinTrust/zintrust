/**
 * Cache Configuration
 * Caching drivers and settings
 * Sealed namespace for immutability
 */

import { Env } from './env';
import { CacheConfigInput, CacheDriverConfig } from './type';
import { ErrorFactory } from '@zintrust/core';

const getCacheDriver = (config: CacheConfigInput, name?: string): CacheDriverConfig => {
  const selected = String(name ?? config.default).trim();
  const storeName = selected === 'default' ? String(config.default).trim() : selected;
  const isExplicitSelection =
    name !== undefined && String(name).trim().length > 0 && String(name).trim() !== 'default';

  if (storeName.length > 0 && Object.hasOwn(config.drivers, storeName)) {
    const resolved = (config.drivers as Record<string, CacheDriverConfig>)[storeName];
    if (resolved !== undefined) return resolved;
  }

  if (isExplicitSelection) {
    throw ErrorFactory.createConfigError(`Cache store not configured: ${storeName}`);
  }

  // Backwards-compatible fallback.
  const fallback = config.drivers['memory'] ?? Object.values(config.drivers)[0];
  if (fallback !== undefined) return fallback;

  throw ErrorFactory.createConfigError('No cache stores are configured');
};

const cacheConfigObj = {
  /**
   * Default cache driver
   */
  default: Env.CACHE_DRIVER,

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
    'kv-remote': {
      driver: 'kv-remote' as const,
      ttl: Env.getInt('CACHE_KV_TTL', 3600),
    },
  },

  /**
   * Get cache driver config
   */
  getDriver(name?: string): CacheDriverConfig {
    return getCacheDriver(this, name);
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
