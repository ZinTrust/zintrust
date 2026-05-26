import { Env } from '@zintrust/core/config';
import { ErrorFactory } from '@zintrust/core/errors';
import { createRedisConnection } from '@zintrust/core/redis';
import type { CacheDriver } from './index.js';

type RedisProxyClient = {
  get: (key: string) => Promise<string | null>;
  set: (...args: unknown[]) => Promise<unknown>;
  del: (...keys: string[]) => Promise<number>;
  flushdb: () => Promise<unknown>;
  exists: (...keys: string[]) => Promise<number>;
};

const createProxyClient = (): RedisProxyClient => {
  if (Env.REDIS_PROXY_URL.trim() === '' && Env.USE_REDIS_PROXY !== true) {
    throw ErrorFactory.createConfigError('Redis proxy URL is missing (REDIS_PROXY_URL)');
  }

  return createRedisConnection(
    {
      host: Env.get('REDIS_HOST', 'localhost'),
      port: Env.getInt('REDIS_PORT', 6379),
      password: Env.get('REDIS_PASSWORD'),
      db: Env.getInt('REDIS_DB', 0),
    },
    3,
    { subsystem: 'cache' }
  ) as unknown as RedisProxyClient;
};

export const RedisProxyAdapter = Object.freeze({
  create(): CacheDriver {
    const client = createProxyClient();

    return {
      async get<T>(key: string): Promise<T | null> {
        const result = await client.get(key);
        if (result === null) return null;
        try {
          return JSON.parse(result) as T;
        } catch {
          return null;
        }
      },

      async set<T>(key: string, value: T, ttl?: number): Promise<void> {
        const json = JSON.stringify(value);
        if (Number.isFinite(ttl) && (ttl ?? 0) > 0) {
          await client.set(key, json, 'EX', ttl);
        } else {
          await client.set(key, json);
        }
      },

      async delete(key: string): Promise<void> {
        await client.del(key);
      },

      async clear(): Promise<void> {
        await client.flushdb();
      },

      async has(key: string): Promise<boolean> {
        const result = await client.exists(key);
        return result > 0;
      },
    };
  },
});

export default RedisProxyAdapter;
