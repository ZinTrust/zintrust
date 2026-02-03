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
  const port = Number(env['DB_PORT_POSTGRESQL'] ?? Env.DB_PORT_POSTGRESQL ?? 5432);
  const user =
    (env['DB_USERNAME_POSTGRESQL'] as string) ?? Env.DB_USERNAME_POSTGRESQL ?? 'postgres';
  const password = (env['DB_PASSWORD_POSTGRESQL'] as string) ?? Env.DB_PASSWORD_POSTGRESQL ?? '';
  const database =
    (env['DB_DATABASE_POSTGRESQL'] as string) ?? Env.DB_DATABASE_POSTGRESQL ?? 'postgres';
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
    ZT_POOL_DRIVER: 'postgresql',
    ZT_POOL_CONFIG_JSON: existingConfig,
  };
};

/**
 * ZinTrustPostgresPoolDurableObject
 *
 * Backwards-compatible wrapper that delegates to PoolDurableObject using the postgresql driver.
 */
export class ZinTrustPostgresPoolDurableObject {
  private readonly delegate: PoolDurableObject;

  constructor(state: DurableObjectState, env: Record<string, unknown>) {
    this.delegate = new PoolDurableObject(state, normalizeEnv(env));
  }

  async fetch(request: Request): Promise<Response> {
    return this.delegate.fetch(request);
  }
}
