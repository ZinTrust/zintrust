/* eslint-disable no-restricted-syntax */
import { Env } from '@config/env';
import { PoolDurableObject } from '@runtime/durable-objects/PoolDurableObject';

type DurableObjectState = {
  waitUntil: (promise: Promise<unknown>) => void;
  storage: {
    get: (key: string) => Promise<unknown>;
    put: (key: string, value: unknown) => Promise<void>;
    delete: (key: string) => Promise<void>;
    list: () => Promise<{ keys: string[] }>;
    transaction: <T>(callback: (txn: unknown) => Promise<T>) => Promise<T>;
  };
  id: { toString: () => string };
};

const buildConfig = (env: Record<string, unknown>): Record<string, unknown> => {
  const host = (env['REDIS_HOST'] as string) ?? Env.REDIS_HOST ?? '127.0.0.1';
  const port = Number(env['REDIS_PORT'] ?? Env.REDIS_PORT ?? 6379);
  const password = (env['REDIS_PASSWORD'] as string) ?? Env.REDIS_PASSWORD ?? '';
  const db = Number(env['REDIS_DB'] ?? Env.getInt('REDIS_DB', 0));

  return { host, port, password, db };
};

const normalizeEnv = (env: Record<string, unknown>): Record<string, unknown> => {
  const existingConfig =
    typeof env['ZT_POOL_CONFIG_JSON'] === 'string' && env['ZT_POOL_CONFIG_JSON'].trim() !== ''
      ? String(env['ZT_POOL_CONFIG_JSON'])
      : JSON.stringify(buildConfig(env));

  return {
    ...env,
    ZT_POOL_DRIVER: 'redis',
    ZT_POOL_CONFIG_JSON: existingConfig,
  };
};

/**
 * ZinTrustRedisPoolDurableObject
 *
 * Backwards-compatible wrapper that delegates to PoolDurableObject using the redis driver.
 */
export class ZinTrustRedisPoolDurableObject {
  private readonly delegate: PoolDurableObject;

  constructor(state: DurableObjectState, env: Record<string, unknown>) {
    this.delegate = new PoolDurableObject(state, normalizeEnv(env));
  }

  async fetch(request: Request): Promise<Response> {
    // console.log('[ZinTrustRedisPoolDurableObject] fetch request:', request.url);
    return this.delegate.fetch(request);
  }
}
