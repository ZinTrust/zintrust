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
  const anyEnv = process.env as { get?: (k: string, d?: string) => string };
  const fromEnv = typeof anyEnv.get === 'function' ? anyEnv.get('REDIS_URL', '') : '';
  const hasProcess = typeof process === 'object' && process !== null;
  const fallback = hasProcess ? (process.env?.['REDIS_URL'] ?? '') : '';
  const trimmed = fromEnv.trim();
  const url = (trimmed.length > 0 ? fromEnv : String(fallback)).trim();

  // If REDIS_URL exists, use it
  if (url.length > 0) return url;

  // Otherwise build URL from individual settings
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
  if (publishClientConnected && publishClientInstance !== null) {
    return publishClientInstance;
  }

  const url = buildRedisUrl();
  if (url === null) throw ErrorFactory.createConfigError('Redis publish client requires REDIS_URL');

  try {
    // Try redis package first
    const mod = (await import('redis')) as unknown as {
      createClient: (opts: { url: string }) => RedisPublishClient;
    };
    const client = mod.createClient({ url });

    if (typeof client.connect === 'function') {
      try {
        await client.connect();
        publishClientInstance = client;
        publishClientConnected = true;
        return client;
      } catch (err) {
        throw ErrorFactory.createTryCatchError(
          'Redis publish client failed to connect',
          err as Error
        );
      }
    }

    publishClientInstance = client;
    publishClientConnected = true;
    return client;
  } catch {
    // Fallback to ioredis when available
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
        connect: redis.connect ? () => redis.connect() : undefined,
      };

      if (typeof client.connect === 'function') {
        try {
          await client.connect();
          publishClientInstance = client;
          publishClientConnected = true;
          return client;
        } catch (err) {
          throw ErrorFactory.createTryCatchError(
            'Redis publish client (ioredis) failed to connect',
            err as Error
          );
        }
      }

      publishClientInstance = client;
      publishClientConnected = true;
      return client;
    } catch {
      const globalFake = (globalThis as unknown as { __fakeRedisClient?: RedisPublishClient })
        .__fakeRedisClient;
      if (globalFake === undefined) {
        throw ErrorFactory.createConfigError(
          "Redis publish client requires the 'redis' or 'ioredis' package (run `zin add broadcast:redis' / `zin plugin install broadcast:redis`, or `npm install redis` / `npm install ioredis`) or a test fake client set in globalThis.__fakeRedisClient"
        );
      }

      publishClientInstance = globalFake;
      publishClientConnected = true;
      return globalFake;
    }
  }
};

/**
 * Reset the singleton publish client (useful for testing)
 */
export const resetPublishClient = (): void => {
  publishClientInstance = null;
  publishClientConnected = false;
};
