import { ErrorFactory } from '@zintrust/core';

export type RedisPublishClient = {
  connect?: () => Promise<void>;
  publish(channel: string, message: string): Promise<number>;
};

let publishClientInstance: RedisPublishClient | null = null;
let publishClientConnected = false;

/**
 * Build Redis URL from environment variables
 */
const buildRedisUrl = (): string => {
  // Get REDIS_URL from environment
  const redisUrl = getRedisUrlFromEnv();
  if (redisUrl) return redisUrl;

  // Build URL from individual components
  return buildRedisUrlFromComponents();
};

/**
 * Get REDIS_URL from environment variables
 */
const getRedisUrlFromEnv = (): string | null => {
  const anyEnv = process.env as { get?: (k: string, d?: string) => string };
  const fromEnv = typeof anyEnv.get === 'function' ? anyEnv.get('REDIS_URL', '') : '';
  const hasProcess = typeof process === 'object' && process !== null;
  const fallback = hasProcess ? (process.env?.['REDIS_URL'] ?? '') : '';
  const trimmed = fromEnv.trim();
  const url = (trimmed.length > 0 ? fromEnv : String(fallback)).trim();

  return url.length > 0 ? url : null;
};

/**
 * Build Redis URL from individual environment components
 */
const buildRedisUrlFromComponents = (): string => {
  const host = process.env?.['REDIS_HOST'] ?? 'localhost';
  const port = Number.parseInt(process.env?.['REDIS_PORT'] ?? '6379', 10);
  const password = process.env?.['REDIS_PASSWORD'];
  const database = Number.parseInt(process.env?.['REDIS_QUEUE_DB'] ?? '1', 10);

  let redisUrl = `redis://`;
  if (password) redisUrl += `:${password}@`;
  redisUrl += `${host}:${port}`;
  if (database > 0) redisUrl += `/${database}`;

  return redisUrl;
};

/**
 * Singleton Redis publish client factory
 * Creates and caches a Redis publish client for broadcasting
 */
export const createRedisPublishClient = async (): Promise<RedisPublishClient> => {
  // Return cached instance if available
  if (publishClientConnected && publishClientInstance !== null) {
    return publishClientInstance;
  }

  const url = buildRedisUrl();
  if (url === null) throw ErrorFactory.createConfigError('Redis publish client requires REDIS_URL');

  // Try different Redis clients in order of preference
  const redisClient =
    (await tryCreateRedisClient(url)) || (await tryCreateIoRedisClient(url)) || getFallbackClient();
  return redisClient as RedisPublishClient;
};

/**
 * Try to create client using 'redis' package
 */
const tryCreateRedisClient = async (url: string): Promise<RedisPublishClient | null> => {
  try {
    const mod = (await import('redis')) as unknown as {
      createClient: (opts: { url: string }) => RedisPublishClient;
    };
    const client = mod.createClient({ url });

    if (typeof client.connect === 'function') {
      await connectClient(client, 'Redis publish client failed to connect');
    }

    return cacheAndReturnClient(client);
  } catch {
    return null;
  }
};

/**
 * Try to create client using 'ioredis' package
 */
const tryCreateIoRedisClient = async (url: string): Promise<RedisPublishClient | null> => {
  try {
    const mod = (await import('ioredis')) as unknown as {
      default: (url: string) => {
        connect?: () => Promise<void>;
        publish: (channel: string, message: string) => Promise<number>;
      };
    };

    const redis = mod.default(url);
    const client: RedisPublishClient = {
      publish: (channel: string, message: string) => redis.publish(channel, message),
      connect: redis.connect
        ? async (): Promise<void> => {
            const connectFn = redis.connect as () => Promise<void>;
            await connectFn();
          }
        : undefined,
    };

    if (typeof client.connect === 'function') {
      await connectClient(client, 'Redis publish client (ioredis) failed to connect');
    }

    return cacheAndReturnClient(client);
  } catch {
    return null;
  }
};

/**
 * Get fallback client from global or throw error
 */
const getFallbackClient = (): RedisPublishClient => {
  const globalFake = (globalThis as unknown as { __fakeRedisClient?: RedisPublishClient })
    .__fakeRedisClient;

  if (globalFake === undefined) {
    throw ErrorFactory.createConfigError(
      "Redis publish client requires the 'redis' or 'ioredis' package (run `zin add broadcast:redis' / `zin plugin install broadcast:redis`, or `npm install redis` / `npm install ioredis`) or a test fake client set in globalThis.__fakeRedisClient"
    );
  }

  return cacheAndReturnClient(globalFake);
};

/**
 * Connect to Redis client with error handling
 */
const connectClient = async (client: RedisPublishClient, errorMessage: string): Promise<void> => {
  try {
    if (client.connect) {
      await client.connect();
    }
  } catch (err) {
    throw ErrorFactory.createTryCatchError(errorMessage, err as Error);
  }
};

/**
 * Cache and return the client instance
 */
const cacheAndReturnClient = (client: RedisPublishClient): RedisPublishClient => {
  publishClientInstance = client;
  publishClientConnected = true;
  return client;
};

/**
 * Reset the singleton publish client (useful for testing)
 */
export const resetPublishClient = (): void => {
  publishClientInstance = null;
  publishClientConnected = false;
};
