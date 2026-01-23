import { Env } from '@config/env';
import type { RedisBroadcastDriverConfig } from '@config/type';
import { ErrorFactory } from '@exceptions/ZintrustError';
import type { QueueMessage } from '@tools/queue/Queue';
import { Queue } from '@tools/queue/Queue';

export type QueueDriver = {
  enqueue<T = unknown>(queue: string, payload: T): Promise<string>;
  dequeue<T = unknown>(queue: string): Promise<QueueMessage<T> | undefined>;
  ack(queue: string, id: string): Promise<void>;
  length(queue: string): Promise<number>;
  drain(queue: string): Promise<void>;
};

export type RedisPublishClient = {
  connect?: () => Promise<void>;
  publish(channel: string, message: string): Promise<number>;
};

export const buildRedisUrl = (config?: RedisBroadcastDriverConfig): string => {
  // Otherwise build URL from individual settings (like cache driver)
  const host = config?.host ?? Env.get('REDIS_HOST', 'localhost');
  const port = config?.port ?? Env.getInt('REDIS_PORT', 6379);
  const password = config?.password ?? Env.get('REDIS_PASSWORD');
  const database = config?.database ?? Env.getInt('REDIS_QUEUE_DB', 1);

  let redisUrl = `redis://`;
  if (password) redisUrl += `:${password}@`;
  redisUrl += `${host}:${port}`;
  if (database > 0) redisUrl += `/${database}`;

  return redisUrl;
};

export const getRedisUrl = (config?: RedisBroadcastDriverConfig): string | null => {
  const fromEnv = Env.get('REDIS_URL', '');
  const hasProcess = typeof process === 'object' && process !== null;
  const fallback = hasProcess ? (process.env?.['REDIS_URL'] ?? '') : '';
  const trimmed = fromEnv.trim();
  const url = (trimmed.length > 0 ? fromEnv : String(fallback)).trim();

  // If REDIS_URL exists, use it
  if (url.length > 0) return url;

  return buildRedisUrl(config);
};

export const ensureDriver = async <T = QueueDriver>(type?: 'queue' | 'publish'): Promise<T> => {
  if (type === 'publish') {
    // Return Redis publish client with publish() method from package
    const mod = (await import('@zintrust/queue-redis')) as unknown as {
      createRedisPublishClient?: () => Promise<RedisPublishClient>;
    };

    if (mod.createRedisPublishClient) {
      return mod.createRedisPublishClient() as T;
    }

    throw ErrorFactory.createConfigError(
      'Redis publish client is not available in queue-redis package'
    );
  }

  // Return queue driver (current behavior)
  try {
    return Queue.get('redis') as T;
  } catch {
    try {
      const mod = (await import('@zintrust/queue-redis')) as unknown as {
        RedisQueue?: QueueDriver;
      };

      if (mod.RedisQueue !== undefined) {
        Queue.register('redis', mod.RedisQueue);
      }

      return Queue.get('redis') as T;
    } catch (error) {
      throw ErrorFactory.createConfigError(
        'Redis queue driver is not registered. Install queue:redis via zin plugin install.',
        error as Error
      );
    }
  }
};
