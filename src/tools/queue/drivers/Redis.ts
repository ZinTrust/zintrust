import { generateUuid } from '@/common/utility';
import { Env } from '@config/env';
import { ErrorFactory } from '@exceptions/ZintrustError';
import type { QueueMessage } from '@tools/queue/Queue';

type IRedisClient = {
  connect?: () => Promise<void>;
  rPush(queue: string, value: string): Promise<number>;
  lPop(queue: string): Promise<string | null>;
  lLen(queue: string): Promise<number>;
  del(queue: string): Promise<number>;
};

const getRedisUrl = (): string | null => {
  const fromEnv = Env.get('REDIS_URL', '');
  const hasProcess = typeof process === 'object' && process !== null;
  const fallback = hasProcess ? (process.env?.['REDIS_URL'] ?? '') : '';
  const trimmed = fromEnv.trim();
  const url = (trimmed.length > 0 ? fromEnv : String(fallback)).trim();
  return url.length > 0 ? url : null;
};

export const RedisQueue = (() => {
  let client: IRedisClient | null = null;
  let connected = false;

  const ensureClient = async (): Promise<IRedisClient> => {
    if (connected && client !== null) return client;
    const url = getRedisUrl();
    if (url === null) throw ErrorFactory.createConfigError('Redis queue driver requires REDIS_URL');

    // Import lazily so package is optional for environments that don't use Redis
    // Prefer real 'redis' package when available, otherwise allow tests to inject a fake client
    try {
      // Dynamically import the redis package if available (optional dependency)
      // Tests can inject a fake client on `globalThis.__fakeRedisClient` if the package is absent.
      // Dynamically import the redis package if available (optional dependency)
      const mod = (await import('redis')) as unknown as {
        createClient: (opts: { url: string }) => IRedisClient;
      };
      const createClient = mod.createClient;
      client = createClient({ url });

      if (typeof client.connect === 'function') {
        try {
          // Await connect to ensure readiness; network errors will be surfaced

          await client.connect();
          connected = true;
        } catch (connectionError) {
          connected = false;
          // log non-fatally — operations will surface errors as needed
          // eslint-disable-next-line no-console
          console.warn('Redis client connect failed:', String(connectionError));
        }
      } else {
        connected = true;
      }
    } catch {
      const globalFake = (globalThis as unknown as { __fakeRedisClient?: IRedisClient })
        .__fakeRedisClient;
      if (globalFake === undefined) {
        throw ErrorFactory.createConfigError(
          "Redis queue driver requires the 'redis' package (run `zin add queue:redis` / `zin plugin install queue:redis`, or `npm install redis`) or a test fake client set in globalThis.__fakeRedisClient"
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
      // Simple list-based queue removes on dequeue, so ack is a no-op here.
      // For visibility timeout or retry semantics, implement BRPOPLPUSH and a processing list.
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
