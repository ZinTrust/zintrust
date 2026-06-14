import { Cloudflare } from '@zintrust/core/cloudflare';
import { Env } from '@zintrust/core/config';
import { ErrorFactory } from '@zintrust/core/errors';
import { Logger } from '@zintrust/core/logger';
import { createRedisConnection, type RedisTransportOptions } from '@zintrust/core/redis';

// Minimal interface to avoid importing internal core types
export interface CacheDriver {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttl?: number): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
  has(key: string): Promise<boolean>;
  increment?(key: string, amount?: number): Promise<number>;
  decrement?(key: string, amount?: number): Promise<number>;
  getRedisClient?(): unknown;
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
  set: (key: string, value: string, ...args: unknown[]) => Promise<unknown>;
  del: (...keys: string[]) => Promise<number>;
  flushDb: () => Promise<unknown>;
  exists: (key: string) => Promise<number>;
  incrBy: (key: string, amount: number) => Promise<number>;
  decrBy: (key: string, amount: number) => Promise<number>;
};

type IoRedisClient = {
  connect?: () => Promise<void>;
  quit: () => Promise<void>;
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string, ...args: unknown[]) => Promise<unknown>;
  del: (...keys: string[]) => Promise<number>;
  flushdb?: () => Promise<unknown>;
  flushDb?: () => Promise<unknown>;
  exists: (key: string) => Promise<number>;
  incrby?: (key: string, amount: number) => Promise<number>;
  incrBy?: (key: string, amount: number) => Promise<number>;
  decrby?: (key: string, amount: number) => Promise<number>;
  decrBy?: (key: string, amount: number) => Promise<number>;
};

const createSharedRedisConnection = createRedisConnection as unknown as (
  config: { host: string; port: number; password?: string; db: number },
  maxRetries?: number,
  options?: RedisTransportOptions
) => IoRedisClient;

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

type CacheAction = 'GET' | 'SET' | 'DEL' | 'FLUSHDB' | 'EXISTS';

type CacheFailureState = {
  isDisabled: () => boolean;
  disableAfterFailure: (action: CacheAction, error: unknown) => void;
};

type CacheOperations<TClient> = {
  get: (client: TClient, key: string) => Promise<string | null>;
  set: (client: TClient, key: string, json: string, ttl: number) => Promise<void>;
  del: (client: TClient, key: string) => Promise<void>;
  clear: (client: TClient) => Promise<void>;
  exists: (client: TClient, key: string) => Promise<number>;
  increment?: (client: TClient, key: string, amount: number) => Promise<number>;
  decrement?: (client: TClient, key: string, amount: number) => Promise<number>;
};

const logCacheFailure = (action: CacheAction, error: unknown): void => {
  Logger.error(`Redis cache ${action} failed`, error);
};

const createCacheFailureState = (): CacheFailureState => {
  let disabled = false;

  return {
    isDisabled: () => disabled,
    disableAfterFailure: (action, error): void => {
      if (!disabled) {
        logCacheFailure(action, error);
      }
      disabled = true;
    },
  };
};

const incrementValue = async <TClient>(
  ensureClient: () => Promise<TClient>,
  operations: CacheOperations<TClient>,
  failureState: CacheFailureState,
  defaultTtl: number,
  key: string,
  amount: number
): Promise<number> => {
  if (failureState.isDisabled()) return 0;
  try {
    const client = await ensureClient();
    if (operations.increment) return operations.increment(client, key, amount);
    const current = Number(safeJsonParse<number>((await operations.get(client, key)) ?? '0') ?? 0);
    const next = current + amount;
    await operations.set(client, key, JSON.stringify(next), defaultTtl);
    return next;
  } catch (error) {
    failureState.disableAfterFailure('SET', error);
    return 0;
  }
};

const decrementValue = async <TClient>(
  ensureClient: () => Promise<TClient>,
  operations: CacheOperations<TClient>,
  failureState: CacheFailureState,
  defaultTtl: number,
  key: string,
  amount: number
): Promise<number> => {
  if (failureState.isDisabled()) return 0;
  try {
    const client = await ensureClient();
    if (operations.decrement) return operations.decrement(client, key, amount);
    const current = Number(safeJsonParse<number>((await operations.get(client, key)) ?? '0') ?? 0);
    const next = current - amount;
    await operations.set(client, key, JSON.stringify(next), defaultTtl);
    return next;
  } catch (error) {
    failureState.disableAfterFailure('SET', error);
    return 0;
  }
};

// Driver objects intentionally keep the cache method table in one sealed return value.

const createCacheOperations = <TClient>(
  ensureClient: () => Promise<TClient>,
  operations: CacheOperations<TClient>,
  defaultTtl: number,
  getRedisClient?: () => unknown
): CacheDriver => {
  const failureState = createCacheFailureState();

  return {
    async get<T>(key: string): Promise<T | null> {
      if (failureState.isDisabled()) return null;
      try {
        const client = await ensureClient();
        const value = await operations.get(client, key);
        if (value === null) return null;
        return safeJsonParse<T>(value);
      } catch (error) {
        failureState.disableAfterFailure('GET', error);
        return null;
      }
    },

    async set<T>(key: string, value: T, ttl?: number): Promise<void> {
      if (failureState.isDisabled()) return;
      try {
        const client = await ensureClient();
        const json = JSON.stringify(value);
        const effectiveTtl = ttl ?? defaultTtl;

        await operations.set(client, key, json, effectiveTtl);
      } catch (error) {
        failureState.disableAfterFailure('SET', error);
      }
    },

    async delete(key: string): Promise<void> {
      if (failureState.isDisabled()) return;
      try {
        const client = await ensureClient();
        await operations.del(client, key);
      } catch (error) {
        failureState.disableAfterFailure('DEL', error);
      }
    },

    async clear(): Promise<void> {
      if (failureState.isDisabled()) return;
      try {
        const client = await ensureClient();
        await operations.clear(client);
      } catch (error) {
        failureState.disableAfterFailure('FLUSHDB', error);
      }
    },

    async has(key: string): Promise<boolean> {
      if (failureState.isDisabled()) return false;
      try {
        const client = await ensureClient();
        const count = await operations.exists(client, key);
        return count > 0;
      } catch (error) {
        failureState.disableAfterFailure('EXISTS', error);
        return false;
      }
    },

    async increment(key: string, amount = 1): Promise<number> {
      return incrementValue(ensureClient, operations, failureState, defaultTtl, key, amount);
    },

    async decrement(key: string, amount = 1): Promise<number> {
      return decrementValue(ensureClient, operations, failureState, defaultTtl, key, amount);
    },

    ...(getRedisClient ? { getRedisClient } : {}),
  };
};

const createWorkersCacheDriver = (config: RedisCacheConfig): CacheDriver => {
  let client: IoRedisClient | undefined;
  let connected = false;
  const ensureClient = async (): Promise<IoRedisClient> => {
    client ??= createSharedRedisConnection(
      {
        host: config.host,
        port: config.port,
        password: config.password,
        db: config.database ?? 0,
      },
      3,
      { subsystem: 'cache' }
    );

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
          return redisClient.set(key, json, 'EX', ttl) as Promise<void>;
        } else {
          return redisClient.set(key, json) as Promise<void>;
        }
      },
      del: async (redisClient, key) => {
        await redisClient.del(key);
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
      increment: async (redisClient, key, amount) => {
        if (typeof redisClient.incrBy === 'function') {
          return redisClient.incrBy(key, amount);
        }
        if (typeof redisClient.incrby === 'function') {
          return redisClient.incrby(key, amount);
        }
        const current = Number((await redisClient.get(key)) ?? 0);
        const next = current + amount;
        await redisClient.set(key, String(next));
        return next;
      },
      decrement: async (redisClient, key, amount) => {
        if (typeof redisClient.decrBy === 'function') {
          return redisClient.decrBy(key, amount);
        }
        if (typeof redisClient.decrby === 'function') {
          return redisClient.decrby(key, amount);
        }
        const current = Number((await redisClient.get(key)) ?? 0);
        const next = current - amount;
        await redisClient.set(key, String(next));
        return next;
      },
    },
    config.ttl ?? 300,
    () => client
  );
};

const createNodeCacheDriver = (config: RedisCacheConfig): CacheDriver => {
  let client: RedisClient | undefined;
  let connected = false;

  const ensureClient = async (): Promise<RedisClient> => {
    if (client === undefined) {
      const { createClient } = await importRedis();
      client = createClient({
        socket: { host: config.host, port: config.port },
        password: config.password,
        database: config.database ?? 0,
      });
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
      del: async (redisClient, key) => {
        await redisClient.del(key);
      },
      clear: (redisClient) => redisClient.flushDb() as Promise<void>,
      exists: (redisClient, key) => redisClient.exists(key),
      increment: (redisClient, key, amount) => redisClient.incrBy(key, amount),
      decrement: (redisClient, key, amount) => redisClient.decrBy(key, amount),
    },
    config.ttl ?? 300,
    () => client
  );
};

const shouldUseProxy = (): boolean => {
  return Env.USE_REDIS_PROXY === true;
};

export const RedisCacheDriver = Object.freeze({
  create(config: RedisCacheConfig): CacheDriver {
    const isWorkers = Cloudflare.getWorkersEnv() !== null;
    if (shouldUseProxy()) {
      return createWorkersCacheDriver(config);
    }

    if (isWorkers && Cloudflare.isCloudflareSocketsEnabled() === false) {
      throw ErrorFactory.createConfigError(
        'Redis cache driver in Cloudflare Workers requires USE_REDIS_PROXY=true with REDIS_RPC_URL/REDIS_PROXY_URL, or ENABLE_CLOUDFLARE_SOCKETS=true.'
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
