/**
 * Cache Configuration
 * Caching drivers and settings
 * Sealed namespace for immutability
 */

import {
  parseJsonObjectEnv,
  readWorkersFallbackBool,
  readWorkersFallbackInt,
  readWorkersFallbackString,
} from '@common/EnvFallbackUtils';
import { Env } from '@config/env';
import type {
  CacheConfigInput,
  CacheDriverConfig,
  RedisCacheDriverConfig,
  ZedgiRedisCacheDriverConfig,
} from '@config/type';
import { ErrorFactory } from '@exceptions/ZintrustError';
import { StartupConfigFile, StartupConfigFileRegistry } from '@runtime/StartupConfigFileRegistry';

export type CacheConfigOverrides = Partial<{
  default: string;
  drivers: CacheConfigInput['drivers'];
  keyPrefix: string;
  ttl: number;
}>;

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

  if (Object.keys(config.drivers ?? {}).length === 0) {
    throw ErrorFactory.createConfigError('No cache stores are configured');
  }

  throw ErrorFactory.createConfigError(
    `Cache default store not configured: ${storeName || '<empty>'}`
  );
};

const createRedisCacheDriver = (): RedisCacheDriverConfig => ({
  driver: 'redis' as const,
  host: readWorkersFallbackString('WORKERS_REDIS_HOST', 'REDIS_HOST', 'localhost'),
  port: readWorkersFallbackInt('WORKERS_REDIS_PORT', 'REDIS_PORT', 6379),
  password: readWorkersFallbackString('WORKERS_REDIS_PASSWORD', 'REDIS_PASSWORD', ''),
  database: readWorkersFallbackInt(
    'WORKERS_REDIS_CACHE_DB',
    'REDIS_CACHE_DB',
    Env.getInt('REDIS_DB', 0)
  ),
  ttl: Env.getInt('CACHE_REDIS_TTL', 3600),
  // Cloudflare tunnel-specific ioredis options
  connectTimeout: readWorkersFallbackInt(
    'WORKERS_REDIS_CONNECT_TIMEOUT',
    'REDIS_CONNECT_TIMEOUT',
    Env.REDIS_CONNECT_TIMEOUT
  ),
  keepAlive: readWorkersFallbackInt(
    'WORKERS_REDIS_KEEP_ALIVE',
    'REDIS_KEEP_ALIVE',
    Env.REDIS_KEEP_ALIVE
  ),
  enableOfflineQueue: readWorkersFallbackBool(
    'WORKERS_REDIS_ENABLE_OFFLINE_QUEUE',
    'REDIS_ENABLE_OFFLINE_QUEUE',
    Env.REDIS_ENABLE_OFFLINE_QUEUE
  ),
  maxLoadingRetryTime: readWorkersFallbackInt(
    'WORKERS_REDIS_MAX_LOADING_RETRY_TIME',
    'REDIS_MAX_LOADING_RETRY_TIME',
    Env.REDIS_MAX_LOADING_RETRY_TIME
  ),
});

const createZedgiRedisCacheDriver = (): ZedgiRedisCacheDriverConfig => ({
  driver: 'redis-zedgi' as const,
  password: readWorkersFallbackString('WORKERS_REDIS_PASSWORD', 'REDIS_PASSWORD', ''),
  database: readWorkersFallbackInt(
    'WORKERS_REDIS_CACHE_DB',
    'REDIS_CACHE_DB',
    Env.getInt('REDIS_DB', 0)
  ),
  ttl: Env.getInt('CACHE_REDIS_TTL', 3600),
  header: parseJsonObjectEnv('ZEDGI_REDIS_HEADER'),
});

const createBaseCacheDrivers = (): CacheConfigInput['drivers'] => ({
  memory: {
    driver: 'memory' as const,
    ttl: Env.getInt('CACHE_MEMORY_TTL', 3600),
  },
  redis: createRedisCacheDriver(),
  'redis-zedgi': createZedgiRedisCacheDriver(),
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
});

const resolveDefaultCacheDriver = (): string => {
  const envConnection = Env.get('CACHE_CONNECTION', '').trim();

  const envDriver =
    typeof (Env as unknown as { CACHE_DRIVER?: unknown }).CACHE_DRIVER === 'string'
      ? String((Env as unknown as { CACHE_DRIVER?: unknown }).CACHE_DRIVER)
      : Env.get('CACHE_DRIVER', 'memory');

  const selected = envConnection.length > 0 ? envConnection : String(envDriver ?? 'memory');
  return selected.trim().toLowerCase();
};

const createCacheConfig = (): {
  default: string;
  drivers: CacheConfigInput['drivers'];
  getDriver: (name?: string) => CacheDriverConfig;
  keyPrefix: string;
  ttl: number;
} => {
  const baseDefault = resolveDefaultCacheDriver();
  const baseDrivers = createBaseCacheDrivers();

  const overrides: CacheConfigOverrides =
    StartupConfigFileRegistry.get<CacheConfigOverrides>(StartupConfigFile.Cache) ?? {};

  const mergedDrivers = {
    ...baseDrivers,
    ...overrides.drivers,
  } satisfies CacheConfigInput['drivers'];

  const mergedDefault =
    typeof overrides.default === 'string' && overrides.default.trim() !== ''
      ? overrides.default.trim().toLowerCase()
      : baseDefault;

  const mergedKeyPrefix =
    typeof overrides.keyPrefix === 'string' && overrides.keyPrefix.length > 0
      ? overrides.keyPrefix
      : Env.get('CACHE_KEY_PREFIX', 'zintrust:');

  const mergedTtl =
    typeof overrides.ttl === 'number' && Number.isFinite(overrides.ttl) ? overrides.ttl : 3600;

  const cacheConfigObj = {
    /**
     * Default cache driver
     */
    default: mergedDefault,

    /**
     * Cache drivers
     */
    drivers: mergedDrivers,

    /**
     * Get cache driver config
     */
    getDriver(name?: string): CacheDriverConfig {
      return getCacheDriver(this, name);
    },

    /**
     * Key prefix for all cache keys
     */
    keyPrefix: mergedKeyPrefix,

    /**
     * Default cache TTL (seconds)
     */
    ttl: mergedTtl,
  };

  return Object.freeze(cacheConfigObj);
};

export type CacheConfig = ReturnType<typeof createCacheConfig>;

let cached: CacheConfig | null = null;
const proxyTarget: CacheConfig = {} as CacheConfig;

const ensureCacheConfig = (): CacheConfig => {
  if (cached) return cached;
  cached = createCacheConfig();

  try {
    Object.defineProperties(proxyTarget, Object.getOwnPropertyDescriptors(cached));
  } catch {
    // best-effort
  }

  return cached;
};

export const cacheConfig: CacheConfig = new Proxy(proxyTarget, {
  get(_target, prop: keyof CacheConfig) {
    return ensureCacheConfig()[prop];
  },
  ownKeys() {
    ensureCacheConfig();
    return Reflect.ownKeys(proxyTarget);
  },
  getOwnPropertyDescriptor(_target, prop) {
    ensureCacheConfig();
    return Object.getOwnPropertyDescriptor(proxyTarget, prop);
  },
});
