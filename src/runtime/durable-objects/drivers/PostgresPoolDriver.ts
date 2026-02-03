import { Env } from '@config/env';
import { Logger } from '@config/logger';
import { ErrorFactory } from '@exceptions/ZintrustError';
import type { PoolDriver, PoolDriverHealth } from '@runtime/durable-objects/PoolDriver';
import { PoolRegistry } from '@runtime/durable-objects/PoolRegistry';
import { CloudflareSocket } from '@sockets/CloudflareSocket';

type PgPool = {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[]; rowCount?: number }>;
  end: () => Promise<void>;
};

type PgConfig = Readonly<{
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  ssl: boolean;
  timeoutMs: number;
}>;

let config: PgConfig | null = null;
let pgModule: { Pool: new (options: unknown) => PgPool } | null = null;

const parseBoolean = (value: unknown): boolean =>
  value === true || value === 'true' || value === 1 || value === '1';

const normalizePort = (value: unknown): number => {
  const port = Number(value ?? Env.DB_PORT_POSTGRESQL ?? 5432);
  if (!Number.isFinite(port) || port <= 0) {
    throw ErrorFactory.createConfigError('PostgresPoolDriver: invalid port');
  }
  return port;
};

const normalizeTimeout = (value: unknown): number => {
  const timeoutMs = Number(value ?? 30000);
  return Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 30000;
};

const normalizeConfig = (raw: Record<string, unknown>): PgConfig => {
  return {
    host: String(raw['host'] ?? Env.DB_HOST ?? '127.0.0.1'),
    port: normalizePort(raw['port']),
    user: String(raw['user'] ?? Env.DB_USERNAME_POSTGRESQL ?? 'postgres'),
    password: String(raw['password'] ?? Env.DB_PASSWORD_POSTGRESQL ?? ''),
    database: String(raw['database'] ?? Env.DB_DATABASE_POSTGRESQL ?? 'postgres'),
    ssl: parseBoolean(raw['ssl'] ?? raw['tls'] ?? false),
    timeoutMs: normalizeTimeout(raw['timeoutMs']),
  };
};

const getPgModule = async (): Promise<{ Pool: new (options: unknown) => PgPool }> => {
  if (pgModule) return pgModule;
  const loaded = await import('pg');
  // Handle CommonJS default export if necessary
  const mod = loaded.default ?? loaded;
  pgModule = mod as unknown as { Pool: new (options: unknown) => PgPool };
  return pgModule;
};

const normalizeSql = (sql: string): string => {
  if (!sql.includes('?')) return sql;
  let index = 0;
  return sql.replaceAll('?', () => {
    index += 1;
    return `$${index}`;
  });
};

const createPool = async (): Promise<PgPool> => {
  const cfg = config;
  if (!cfg) {
    throw ErrorFactory.createConfigError('PostgresPoolDriver: not initialized');
  }

  const createSocket = CloudflareSocket.create;
  const module = await getPgModule();
  return new module.Pool({
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    database: cfg.database,
    max: 1,
    connectionTimeoutMillis: cfg.timeoutMs,
    ssl: cfg.ssl ? { rejectUnauthorized: false } : undefined,
    stream: (): unknown =>
      createSocket(cfg.host, cfg.port, { tls: cfg.ssl, timeoutMs: cfg.timeoutMs }),
  });
};

const initialize = async (input: Record<string, unknown>): Promise<void> => {
  config = normalizeConfig(input);
  await Promise.resolve();
};

const execute = async (command: string, params: unknown[], _method?: string): Promise<unknown> => {
  if (command.trim() === '') {
    throw ErrorFactory.createValidationError('PostgresPoolDriver: SQL command is required');
  }

  const pool = await createPool();
  try {
    const sql = normalizeSql(command);
    const result = await pool.query(sql, params);
    return {
      rows: (result.rows ?? []) as Record<string, unknown>[],
      rowCount: result.rowCount ?? result.rows?.length ?? 0,
    };
  } finally {
    try {
      await pool.end();
    } catch (error) {
      Logger.warn('[PostgresPoolDriver] Failed to close pool', error);
    }
  }
};

const health = async (): Promise<PoolDriverHealth> => {
  try {
    const pool = await createPool();
    await pool.query('SELECT 1');
    await pool.end();
    return { connected: true };
  } catch (error) {
    Logger.warn('[PostgresPoolDriver] Health check failed', error);
    return { connected: false, meta: { error: String(error) } };
  }
};

const teardown = async (): Promise<void> => {
  config = null;
  await Promise.resolve();
};

export const PostgresPoolDriver: PoolDriver = Object.freeze({
  name: 'postgresql',
  initialize,
  execute,
  teardown,
  health,
});

PoolRegistry.register(PostgresPoolDriver);
