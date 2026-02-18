/**
 * Cache Configuration
 * Caching drivers and settings
 * Sealed namespace for immutability
 */

import { Cloudflare } from '@config/cloudflare';
import { Env } from '@config/env';
import type { CacheConfigInput, CacheDriverConfig } from '@config/type';
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

const readWorkersEnvString = (key: string): string => {
  const workerValue = Cloudflare.getWorkersVar(key);
  if (workerValue !== null && workerValue.trim() !== '') return workerValue;
  return '';
};

const readWorkersFallbackString = (
  workersKey: string,
  fallbackKey: string,
  fallback = ''
): string => {
  const workerValue = readWorkersEnvString(workersKey);
  if (workerValue.trim() !== '') return workerValue;
  return Env.get(fallbackKey, fallback);
};

const readWorkersFallbackInt = (
  workersKey: string,
  fallbackKey: string,
  fallback: number
): number => {
  const raw = readWorkersFallbackString(workersKey, fallbackKey, String(fallback));
  if (raw.trim() === '') return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const createCacheConfig = (): {
  default: string;
  drivers: CacheConfigInput['drivers'];
  getDriver: (name?: string) => CacheDriverConfig;
  keyPrefix: string;
  ttl: number;
} => {
  const baseDefault = (() => {
    const envConnection = Env.get('CACHE_CONNECTION', '').trim();

    const envDriver =
      typeof (Env as unknown as { CACHE_DRIVER?: unknown }).CACHE_DRIVER === 'string'
        ? String((Env as unknown as { CACHE_DRIVER?: unknown }).CACHE_DRIVER)
        : Env.get('CACHE_DRIVER', 'memory');

    const selected = envConnection.length > 0 ? envConnection : String(envDriver ?? 'memory');
    return selected.trim().toLowerCase();
  })();

  const baseDrivers = {
    memory: {
      driver: 'memory' as const,
      ttl: Env.getInt('CACHE_MEMORY_TTL', 3600),
    },
    redis: {
      driver: 'redis' as const,
      host: readWorkersFallbackString('WORKERS_REDIS_HOST', 'REDIS_HOST', 'localhost'),
      port: readWorkersFallbackInt('WORKERS_REDIS_PORT', 'REDIS_PORT', 6379),
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
  } satisfies CacheConfigInput['drivers'];

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
    Object.defineProperties(
      proxyTarget as unknown as object,
      Object.getOwnPropertyDescriptors(cached)
    );
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
    return Reflect.ownKeys(proxyTarget as unknown as object);
  },
  getOwnPropertyDescriptor(_target, prop) {
    ensureCacheConfig();
    return Object.getOwnPropertyDescriptor(proxyTarget as unknown as object, prop);
  },
});
