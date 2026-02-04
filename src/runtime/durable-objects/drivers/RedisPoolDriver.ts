import { Env } from '@config/env';
import { Logger } from '@config/logger';
import { createRedisConnection } from '@config/workers';
import { ErrorFactory } from '@exceptions/ZintrustError';
import type { PoolDriver, PoolDriverHealth } from '@runtime/durable-objects/PoolDriver';
import { PoolRegistry } from '@runtime/durable-objects/PoolRegistry';
import type IORedis from 'ioredis';

type RedisConfig = Readonly<{
  host: string;
  port: number;
  password: string;
  db: number;
  timeoutMs: number;
}>;

type RedisClient = IORedis & {
  call?: (command: string, ...args: unknown[]) => Promise<unknown>;
};

let config: RedisConfig | null = null;

const normalizeDb = (value: unknown): number => {
  const db = Number(value ?? Env.getInt('REDIS_DB', 0));
  return Number.isFinite(db) && db >= 0 ? db : 0;
};

const normalizeTimeout = (value: unknown): number => {
  const timeoutMs = Number(value ?? 30000);
  return Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 30000;
};

const normalizeConfig = (raw: Record<string, unknown>): RedisConfig => {
  const host = String(raw['host'] ?? Env.REDIS_HOST ?? '127.0.0.1');
  const port = Number(raw['port'] ?? Env.REDIS_PORT ?? 6379);
  const password = String(raw['password'] ?? Env.REDIS_PASSWORD ?? '');
  const db = normalizeDb(raw['db']);
  const timeoutMs = normalizeTimeout(raw['timeoutMs']);

  if (!Number.isFinite(port) || port <= 0) {
    throw ErrorFactory.createConfigError('RedisPoolDriver: invalid port');
  }

  return { host, port, password, db, timeoutMs };
};

const createClient = async (): Promise<RedisClient> => {
  const cfg = config;
  if (!cfg) {
    throw ErrorFactory.createConfigError('RedisPoolDriver: not initialized');
  }

  const client = createRedisConnection({
    host: cfg.host,
    port: cfg.port,
    password: cfg.password,
    db: cfg.db,
  }) as RedisClient;

  if (typeof client.connect === 'function') {
    await client.connect();
  }

  return client;
};

const executeCommand = async (
  client: RedisClient,
  command: string,
  params: unknown[]
): Promise<unknown> => {
  const trimmed = command.trim();
  if (trimmed === '') {
    throw ErrorFactory.createValidationError('RedisPoolDriver: command is required');
  }

  const lower = trimmed.toLowerCase();
  const candidate = (client as unknown as Record<string, unknown>)[lower];
  if (typeof candidate === 'function') {
    return (candidate as (...args: unknown[]) => Promise<unknown>)(...params);
  }

  if (typeof client.call === 'function') {
    return client.call(trimmed, ...params);
  }

  throw ErrorFactory.createValidationError(`RedisPoolDriver: unsupported command '${trimmed}'`);
};

const initialize = async (input: Record<string, unknown>): Promise<void> => {
  config = normalizeConfig(input);
  await Promise.resolve();
};

const execute = async (command: string, params: unknown[]): Promise<unknown> => {
  const client = await createClient();
  try {
    return await executeCommand(client, command, params);
  } finally {
    try {
      await client.quit();
    } catch (error) {
      Logger.warn('[RedisPoolDriver] Failed to close client', error);
    }
  }
};

const health = async (): Promise<PoolDriverHealth> => {
  try {
    const client = await createClient();
    const pingFn = (client as unknown as { ping?: () => Promise<unknown> }).ping;
    if (typeof pingFn === 'function') {
      await pingFn();
    } else {
      await executeCommand(client, 'PING', []);
    }
    await client.quit();
    return { connected: true };
  } catch (error) {
    Logger.warn('[RedisPoolDriver] Health check failed', error);
    return { connected: false, meta: { error: String(error) } };
  }
};

const teardown = async (): Promise<void> => {
  config = null;
  await Promise.resolve();
};

export const RedisPoolDriver: PoolDriver = Object.freeze({
  name: 'redis',
  initialize,
  execute,
  teardown,
  health,
});

PoolRegistry.register(RedisPoolDriver);
