// @ts-ignore - config templates are excluded from the main TS project in this repo
import type { CacheConfigOverrides } from '@config/cache';
import { Env } from '@config/env';

/**
 * Cache Configuration (default override)
 *
 * Keep this file declarative:
 * - Core owns env parsing/default logic.
 * - Projects can override config by editing values below.
 */

export default {
  default: Env.get('CACHE_CONNECTION', Env.get('CACHE_DRIVER', 'memory')).trim().toLowerCase(),
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
      uri: Env.get('MONGO_URI', ''),
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
  keyPrefix: Env.get('CACHE_KEY_PREFIX', 'zintrust:'),
  ttl: Env.getInt('CACHE_TTL', 3600),
} satisfies CacheConfigOverrides;
