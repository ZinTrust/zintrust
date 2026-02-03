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

const parseBoolean = (value: unknown): boolean =>
  value === true || value === 'true' || value === 1 || value === '1';

const buildConfig = (env: Record<string, unknown>): Record<string, unknown> => {
  const host = (env['DB_HOST'] as string) ?? Env.DB_HOST ?? '127.0.0.1';
  const port = Number(env['DB_PORT'] ?? Env.DB_PORT ?? 3306);
  const user = (env['DB_USERNAME'] as string) ?? Env.DB_USERNAME ?? 'root';
  const password = (env['DB_PASSWORD'] as string) ?? Env.DB_PASSWORD ?? '';
  const database = (env['DB_DATABASE'] as string) ?? Env.DB_DATABASE ?? 'zintrust';
  const ssl = parseBoolean(env['DB_SSL'] ?? env['DB_TLS'] ?? false);

  return { host, port, user, password, database, ssl };
};

const normalizeEnv = (env: Record<string, unknown>): Record<string, unknown> => {
  const existingConfig =
    typeof env['ZT_POOL_CONFIG_JSON'] === 'string' && env['ZT_POOL_CONFIG_JSON'].trim() !== ''
      ? String(env['ZT_POOL_CONFIG_JSON'])
      : JSON.stringify(buildConfig(env));

  return {
    ...env,
    ZT_POOL_DRIVER: 'mysql',
    ZT_POOL_CONFIG_JSON: existingConfig,
  };
};

/**
 * ZinTrustMySqlPoolDurableObject
 *
 * Backwards-compatible wrapper that delegates to PoolDurableObject using the mysql driver.
 */
export class ZinTrustMySqlPoolDurableObject {
  private readonly delegate: PoolDurableObject;

  constructor(state: DurableObjectState, env: Record<string, unknown>) {
    this.delegate = new PoolDurableObject(state, normalizeEnv(env));
  }

  async fetch(request: Request): Promise<Response> {
    return this.delegate.fetch(request);
  }
}
