# cache config

- Source: `src/config/cache.ts`

## Usage

Import from the framework:

```ts
import { Cache, cacheConfig } from '@zintrust/core';

// Default store (from `cacheConfig.default`)
await Cache.set('foo', 'bar');

// Named store selection (falls back only when not explicitly selecting)
await Cache.store('redis').set('foo', 'bar');

// Config lookup
const defaultCfg = cacheConfig.getDriver();
const redisCfg = cacheConfig.getDriver('redis');

// Strict behavior: explicit unknown store throws a ConfigError
// cacheConfig.getDriver('missing');
```

## Notes

- Cache supports named stores via `cacheConfig.drivers`.
- `cacheConfig.getDriver(name?)` supports the reserved alias `default`.
- If you explicitly select a store name that is not configured, it throws a `ConfigError`.
  driver: 'kv' as const,
  ttl: Env.getInt('CACHE_KV_TTL', 3600),
  },
  },

  /\*\*
  - Get cache driver config
    \*/
    getDriver(): CacheDriverConfig {
    return getCacheDriver(this);
    },

  /\*\*
  - Key prefix for all cache keys
    \*/
    keyPrefix: Env.get('CACHE_KEY_PREFIX', 'zintrust:'),

  /\*\*
  - Default cache TTL (seconds)
    \*/
    ttl: Env.getInt('CACHE_DEFAULT_TTL', 3600),
    };

export const cacheConfig = Object.freeze(cacheConfigObj);
export type CacheConfig = typeof cacheConfig;

```

```
