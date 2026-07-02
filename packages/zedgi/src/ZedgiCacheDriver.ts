import { ErrorFactory } from '@zintrust/core/errors';
import { ZedgiRuntime } from './ZedgiRuntime.js';
import type { CacheDriver, ZedgiRedisCacheConfig } from './types.js';
import type { RedisClient } from '@zedgi/zedgi-client';

const safeJsonParse = <T>(value: string): T | null => {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
};

const normalizeTtl = (ttl: number | undefined, fallback: number): number | undefined => {
  const effective = ttl ?? fallback;
  return Number.isFinite(effective) && effective > 0 ? Math.floor(effective) : undefined;
};

const createDriver = (config: ZedgiRedisCacheConfig): CacheDriver => {
  const redis = (): RedisClient => ZedgiRuntime.redis(config);

  return {
    async get<T>(key: string): Promise<T | null> {
      const value = await redis().get(key);
      return value === null ? null : safeJsonParse<T>(value);
    },

    async many<T>(keys: string[]): Promise<(T | null)[]> {
      if (keys.length === 0) return [];
      const values = await redis().pipeline(keys.map((key) => ({ command: 'GET', args: [key] })));
      return values.map((value) => (typeof value === 'string' ? safeJsonParse<T>(value) : null));
    },

    async set<T>(key: string, value: T, ttl?: number): Promise<void> {
      const json = JSON.stringify(value);
      const seconds = normalizeTtl(ttl, config.ttl);
      if (seconds !== undefined) {
        await redis().set(key, json, 'EX', seconds);
        return;
      }
      await redis().set(key, json);
    },

    async delete(key: string): Promise<void> {
      await redis().del(key);
    },

    async clear(): Promise<void> {
      await redis().call('FLUSHDB');
    },

    async has(key: string): Promise<boolean> {
      return (await redis().exists(key)) > 0;
    },

    async increment(key: string, amount = 1): Promise<number> {
      return redis().incrby(key, amount);
    },

    async decrement(key: string, amount = 1): Promise<number> {
      return redis().decrby(key, amount);
    },

    getRedisClient(): unknown {
      throw ErrorFactory.createConfigError(
        'getRedisClient() is not supported by the redis-zedgi cache driver'
      );
    },
  };
};

export const ZedgiCacheDriver = Object.freeze({
  create(config: ZedgiRedisCacheConfig): CacheDriver {
    return createDriver(config);
  },
});

export default ZedgiCacheDriver;
