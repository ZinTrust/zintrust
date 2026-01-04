import { Logger } from '@zintrust/core';

// Minimal interface to avoid importing internal core types
export interface CacheDriver {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttl?: number): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
  has(key: string): Promise<boolean>;
}

export type RedisCacheConfig = {
  driver: 'redis';
  host: string;
  port: number;
  ttl: number;
};

type RedisClient = {
  connect: () => Promise<void>;
  quit: () => Promise<void>;
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string, opts?: unknown) => Promise<unknown>;
  del: (...keys: string[]) => Promise<number>;
  flushDb: () => Promise<unknown>;
  exists: (key: string) => Promise<number>;
};

async function importRedis(): Promise<{
  createClient: (opts: unknown) => RedisClient;
}> {
  return (await import('redis')) as unknown as {
    createClient: (opts: unknown) => RedisClient;
  };
}

export const RedisCacheDriver = Object.freeze({
  create(config: RedisCacheConfig): CacheDriver {
    let client: RedisClient | undefined;
    let connected = false;

    const ensureClient = async (): Promise<RedisClient> => {
      if (client === undefined) {
        const { createClient } = await importRedis();
        client = createClient({ socket: { host: config.host, port: config.port } });
      }

      if (!connected) {
        await client.connect();
        connected = true;
      }

      return client;
    };

    const safeJsonParse = <T>(value: string): T | null => {
      try {
        return JSON.parse(value) as T;
      } catch {
        return null;
      }
    };

    return {
      async get<T>(key: string): Promise<T | null> {
        try {
          const c = await ensureClient();
          const value = await c.get(key);
          if (value === null) return null;
          return safeJsonParse<T>(value);
        } catch (error) {
          Logger.error('Redis cache GET failed', error);
          return null;
        }
      },

      async set<T>(key: string, value: T, ttl?: number): Promise<void> {
        const c = await ensureClient();
        const json = JSON.stringify(value);
        const effectiveTtl = ttl ?? config.ttl;

        if (Number.isFinite(effectiveTtl) && effectiveTtl > 0) {
          await c.set(key, json, { EX: effectiveTtl });
        } else {
          await c.set(key, json);
        }
      },

      async delete(key: string): Promise<void> {
        const c = await ensureClient();
        await c.del(key);
      },

      async clear(): Promise<void> {
        const c = await ensureClient();
        await c.flushDb();
      },

      async has(key: string): Promise<boolean> {
        const c = await ensureClient();
        const count = await c.exists(key);
        return count > 0;
      },
    };
  },
});

export default RedisCacheDriver;
