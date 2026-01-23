import type { QueueMessage } from '@zintrust/core';
import { ErrorFactory, generateUuid, getRedisUrl, Logger } from '@zintrust/core';

type IRedisClient = {
  connect?: () => Promise<void>;
  rPush(queue: string, value: string): Promise<number>;
  lPop(queue: string): Promise<string | null>;
  lLen(queue: string): Promise<number>;
  del(queue: string): Promise<number>;
};

export const RedisQueue = (() => {
  let client: IRedisClient | null = null;
  let connected = false;

  const ensureClient = async (): Promise<IRedisClient> => {
    if (connected && client !== null) return client;
    const url = getRedisUrl();
    if (url === null) throw ErrorFactory.createConfigError('Redis queue driver requires REDIS_URL');

    // Import lazily so package is optional for environments that don't use Redis
    try {
      // Prefer the redis package when available
      try {
        const mod = (await import('redis')) as unknown as {
          createClient: (opts: { url: string }) => IRedisClient;
        };
        const createClient = mod.createClient;
        client = createClient({ url });

        if (typeof client.connect === 'function') {
          try {
            await client.connect();
            connected = true;
          } catch (connectionError) {
            connected = false;

            Logger.warn('Redis client connect failed:', String(connectionError));
          }
        } else {
          connected = true;
        }
      } catch {
        // Fallback to ioredis when available (used by queue-monitor)
        const mod = (await import('ioredis')) as unknown as {
          default: (url: string) => {
            rpush: (queue: string, value: string) => Promise<number>;
            lpop: (queue: string) => Promise<string | null>;
            llen: (queue: string) => Promise<number>;
            del: (queue: string) => Promise<number>;
          };
        };

        const redis = mod.default(url);
        client = {
          rPush: (queue: string, value: string) => redis.rpush(queue, value),
          lPop: (queue: string) => redis.lpop(queue),
          lLen: (queue: string) => redis.llen(queue),
          del: (queue: string) => redis.del(queue),
        };
        connected = true;
      }
    } catch (error) {
      const globalFake = (globalThis as unknown as { __fakeRedisClient?: IRedisClient })
        .__fakeRedisClient;
      if (globalFake === undefined) {
        throw ErrorFactory.createConfigError(
          "Redis queue driver requires the 'redis' or 'ioredis' package (run `zin add queue:redis` / `zin plugin install queue:redis`, or `npm install redis` / `npm install ioredis`) or a test fake client set in globalThis.__fakeRedisClient",
          error
        );
      }

      client = globalFake;
      connected = true;
    }

    if (client === null)
      throw ErrorFactory.createConfigError('Redis client could not be initialized');
    return client;
  };

  return {
    async enqueue<T = unknown>(queue: string, payload: T): Promise<string> {
      const cli = await ensureClient();
      const id = generateUuid();
      const msg = JSON.stringify({ id, payload, attempts: 0 });
      await cli.rPush(queue, msg);
      return id;
    },

    async dequeue<T = unknown>(queue: string): Promise<QueueMessage<T> | undefined> {
      const cli = await ensureClient();
      const raw = await cli.lPop(queue);
      if (raw === null) return undefined;
      try {
        const parsed = JSON.parse(raw) as QueueMessage<T>;
        return parsed;
      } catch (err) {
        throw ErrorFactory.createTryCatchError('Failed to parse queue message', err as Error);
      }
    },

    async ack(_queue: string, _id: string): Promise<void> {
      return Promise.resolve(); // NOSONAR
    },

    async length(queue: string): Promise<number> {
      const cli = await ensureClient();
      return cli.lLen(queue);
    },

    async drain(queue: string): Promise<void> {
      const cli = await ensureClient();
      await cli.del(queue);
    },
  } as const;
})();

export default RedisQueue;
