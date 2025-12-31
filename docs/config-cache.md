# cache config

- Source: `src/config/cache.ts`

## Usage

Import from the framework:

```ts
import { cache } from '@zintrust/core';

// Example (if supported by the module):
// cache.*
```

## Snapshot (top)

```ts
/**
 * Cache Configuration
 * Caching drivers and settings
 * Sealed namespace for immutability
 */

import { Env } from '@zintrust/core';
import { CacheConfigInput, CacheDriverConfig, CacheDrivers } from '@zintrust/core';

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
```

## Snapshot (bottom)

```ts
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

```
