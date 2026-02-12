import { Env } from '@config/env';
import type { RedisBroadcastDriverConfig } from '@config/type';
import { ErrorFactory } from '@exceptions/ZintrustError';
import { ZintrustLang } from '@lang/lang';
import { existsSync } from '@node-singletons/fs';
import * as path from '@node-singletons/path';
import { pathToFileURL } from '@node-singletons/url';
import type { QueueMessage } from '@queue/Queue';
import { Queue } from '@queue/Queue';

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
  const port = config?.port ?? Env.getInt('REDIS_PORT', ZintrustLang.REDIS_DEFAULT_PORT);
  const password = config?.password ?? Env.get('REDIS_PASSWORD');
  const database = config?.database ?? Env.getInt('REDIS_QUEUE_DB', ZintrustLang.REDIS_DEFAULT_DB);
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

type QueueRedisPublishModule = {
  createRedisPublishClient?: () => Promise<RedisPublishClient>;
};

type QueueRedisDriverModule = {
  RedisQueue?: QueueDriver;
  BullMQRedisQueue?: QueueDriver;
};

const resolveLocalQueueRedisEntry = (): string | null => {
  const cwd =
    typeof process !== 'undefined' && typeof process.cwd === 'function' ? process.cwd() : '';
  if (cwd.trim() === '') return null;

  const localEntry = path.join(cwd, 'dist', 'packages', 'queue-redis', 'src', 'index.js');
  return existsSync(localEntry) ? localEntry : null;
};

const importQueueRedisModule = async <TModule>(): Promise<TModule | undefined> => {
  try {
    return (await import('@zintrust/queue-redis')) as unknown as TModule;
  } catch {
    const localEntry = resolveLocalQueueRedisEntry();
    if (localEntry === null) return undefined;
    const url = pathToFileURL(localEntry).href;
    return (await import(url)) as unknown as TModule;
  }
};

const loadPluginDriver = async <T = QueueDriver>(): Promise<T> => {
  try {
    const mod = await importQueueRedisModule<QueueRedisDriverModule>();
    if (mod === undefined) {
      throw ErrorFactory.createConfigError('queue-redis package not found');
    }

    if (mod.RedisQueue !== undefined) {
      Queue.register('redis', mod.RedisQueue);
    } else if (mod.BullMQRedisQueue !== undefined) {
      Queue.register('redis', mod.BullMQRedisQueue);
    }

    return Queue.get('redis') as T;
  } catch (error) {
    throw ErrorFactory.createConfigError(
      'Redis queue driver is not registered. Install queue:redis via zin plugin install.',
      error as Error
    );
  }
};

export const ensureDriver = async <T = QueueDriver>(type?: 'queue' | 'publish'): Promise<T> => {
  if (type === 'publish') {
    // Return Redis publish client with publish() method from package
    const mod = await importQueueRedisModule<QueueRedisPublishModule>();

    if (mod?.createRedisPublishClient) {
      return mod.createRedisPublishClient() as T;
    }

    throw ErrorFactory.createConfigError(
      'Redis publish client is not available in queue-redis package'
    );
  }

  // Return queue driver (current behavior)
  try {
    const resolved = Queue.get('redis') as QueueDriver & {
      __zintrustCoreRedisQueue?: boolean;
    };
    if (!(resolved.__zintrustCoreRedisQueue ?? false)) {
      return resolved as T;
    }
    return await loadPluginDriver();
  } catch {
    return loadPluginDriver();
  }
};
