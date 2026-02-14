import { Cloudflare, Env, ErrorFactory, Logger, createRedisConnection } from '@zintrust/core';
import { RedisProxyAdapter } from './RedisProxyAdapter.js';

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
  password?: string;
  database?: number;
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

type IoRedisClient = {
  connect?: () => Promise<void>;
  quit: () => Promise<void>;
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string, opts?: unknown) => Promise<unknown>;
  del: (...keys: string[]) => Promise<number>;
  flushdb?: () => Promise<unknown>;
  flushDb?: () => Promise<unknown>;
  exists: (key: string) => Promise<number>;
};

const safeJsonParse = <T>(value: string): T | null => {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
};

async function importRedis(): Promise<{
  createClient: (opts: unknown) => RedisClient;
}> {
  return (await import('redis')) as unknown as {
    createClient: (opts: unknown) => RedisClient;
  };
}

const createCacheOperations = <TClient>(
  ensureClient: () => Promise<TClient>,
  operations: {
    get: (client: TClient, key: string) => Promise<string | null>;
    set: (client: TClient, key: string, json: string, ttl: number) => Promise<void>;
    del: (client: TClient, key: string) => Promise<void>;
    clear: (client: TClient) => Promise<void>;
    exists: (client: TClient, key: string) => Promise<number>;
  },
  defaultTtl: number
): CacheDriver => {
  return {
    async get<T>(key: string): Promise<T | null> {
      try {
        const client = await ensureClient();
        const value = await operations.get(client, key);
        if (value === null) return null;
        return safeJsonParse<T>(value);
      } catch (error) {
        Logger.error('Redis cache GET failed', error);
        return null;
      }
    },

    async set<T>(key: string, value: T, ttl?: number): Promise<void> {
      const client = await ensureClient();
      const json = JSON.stringify(value);
      const effectiveTtl = ttl ?? defaultTtl;

      await operations.set(client, key, json, effectiveTtl);
    },

    async delete(key: string): Promise<void> {
      const client = await ensureClient();
      await operations.del(client, key);
    },

    async clear(): Promise<void> {
      const client = await ensureClient();
      await operations.clear(client);
    },

    async has(key: string): Promise<boolean> {
      const client = await ensureClient();
      const count = await operations.exists(client, key);
      return count > 0;
    },
  };
};

const createWorkersCacheDriver = (config: RedisCacheConfig): CacheDriver => {
  let client: IoRedisClient | undefined;
  let connected = false;

  const ensureClient = async (): Promise<IoRedisClient> => {
    if (client === undefined) {
      client = createRedisConnection({
        host: config.host,
        port: config.port,
        password: config.password,
        db: config.database ?? 0,
      }) as unknown as IoRedisClient;
    }

    if (!connected && typeof client.connect === 'function') {
      await client.connect();
      connected = true;
    }

    return client;
  };

  return createCacheOperations(
    ensureClient,
    {
      get: (redisClient, key) => redisClient.get(key),
      set: (redisClient, key, json, ttl) => {
        if (Number.isFinite(ttl) && ttl > 0) {
          return redisClient.set(key, json, { EX: ttl }) as Promise<void>;
        } else {
          return redisClient.set(key, json) as Promise<void>;
        }
      },
      del: (redisClient, key) => {
        redisClient.del(key);
        return Promise.resolve();
      },
      clear: (redisClient) => {
        if (typeof redisClient.flushDb === 'function') {
          return redisClient.flushDb() as Promise<void>;
        } else if (typeof redisClient.flushdb === 'function') {
          return redisClient.flushdb() as Promise<void>;
        }
        return Promise.resolve();
      },
      exists: (redisClient, key) => redisClient.exists(key),
    },
    config.ttl ?? 300
  );
};

const createNodeCacheDriver = (config: RedisCacheConfig): CacheDriver => {
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

  return createCacheOperations(
    ensureClient,
    {
      get: (redisClient, key) => redisClient.get(key),
      set: (redisClient, key, json, ttl) => {
        if (Number.isFinite(ttl) && ttl > 0) {
          return redisClient.set(key, json, { EX: ttl }) as Promise<void>;
        } else {
          return redisClient.set(key, json) as Promise<void>;
        }
      },
      del: (redisClient, key) => {
        redisClient.del(key);
        return Promise.resolve();
      },
      clear: (redisClient) => {
        redisClient.flushDb();
        return Promise.resolve();
      },
      exists: (redisClient, key) => redisClient.exists(key),
    },
    config.ttl ?? 300
  );
};

const shouldUseProxy = (): boolean => {
  if (Env.REDIS_PROXY_URL.trim() !== '') return true;
  return Env.USE_REDIS_PROXY === true;
};

export const RedisCacheDriver = Object.freeze({
  create(config: RedisCacheConfig): CacheDriver {
    const isWorkers = Cloudflare.getWorkersEnv() !== null;
    if (shouldUseProxy()) {
      return RedisProxyAdapter.create();
    }

    if (isWorkers && Cloudflare.isCloudflareSocketsEnabled() === false) {
      throw ErrorFactory.createConfigError(
        'Redis cache driver requires ENABLE_CLOUDFLARE_SOCKETS=true in Cloudflare Workers.'
      );
    }

    return isWorkers ? createWorkersCacheDriver(config) : createNodeCacheDriver(config);
  },
});

export default RedisCacheDriver;

export { RedisProxyAdapter } from './RedisProxyAdapter.js';

/**
 * Package version and build metadata
 * Available at runtime for debugging and health checks
 */
export const _ZINTRUST_CACHE_REDIS_VERSION = '0.1.15';
export const _ZINTRUST_CACHE_REDIS_BUILD_DATE = '__BUILD_DATE__';
