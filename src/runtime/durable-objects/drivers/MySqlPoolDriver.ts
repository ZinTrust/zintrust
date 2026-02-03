import { Env } from '@config/env';
import { Logger } from '@config/logger';
import { ErrorFactory } from '@exceptions/ZintrustError';
import type { PoolDriver, PoolDriverHealth } from '@runtime/durable-objects/PoolDriver';
import { PoolRegistry } from '@runtime/durable-objects/PoolRegistry';
import { CloudflareSocket } from '@sockets/CloudflareSocket';

type MySqlPool = {
  execute: (sql: string, params: unknown[]) => Promise<[unknown]>;
  query: (sql: string, params: unknown[]) => Promise<[unknown]>;
  end: () => Promise<void>;
};

type MySqlConfig = Readonly<{
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  ssl: boolean;
}>;

let config: MySqlConfig | null = null;
let mysqlModule: { createPool: (options: unknown) => { end: () => Promise<void> } } | null = null;

const parseBoolean = (value: unknown): boolean =>
  value === true || value === 'true' || value === 1 || value === '1';

const normalizeConfig = (raw: Record<string, unknown>): MySqlConfig => {
  const host = String(raw['host'] ?? Env.DB_HOST ?? '127.0.0.1');
  const port = Number(raw['port'] ?? Env.DB_PORT ?? 3306);
  const user = String(raw['user'] ?? Env.DB_USERNAME ?? 'root');
  const password = String(raw['password'] ?? Env.DB_PASSWORD ?? '');
  const database = String(raw['database'] ?? Env.DB_DATABASE ?? 'zintrust');
  const ssl = parseBoolean(raw['ssl'] ?? raw['tls'] ?? false);

  if (!Number.isFinite(port) || port <= 0) {
    throw ErrorFactory.createConfigError('MySqlPoolDriver: invalid port');
  }

  return { host, port, user, password, database, ssl };
};

const getMySqlModule = async (): Promise<{
  createPool: (options: unknown) => MySqlPool;
}> => {
  if (mysqlModule) return mysqlModule as { createPool: (options: unknown) => MySqlPool };
  const loaded = await import('mysql2/promise');
  mysqlModule = loaded.default as unknown as { createPool: (options: unknown) => MySqlPool };
  return mysqlModule as { createPool: (options: unknown) => MySqlPool };
};

const createPool = async (): Promise<MySqlPool> => {
  const cfg = config;
  if (!cfg) {
    throw ErrorFactory.createConfigError('MySqlPoolDriver: not initialized');
  }

  const createSocket = CloudflareSocket.create;
  const module = await getMySqlModule();
  return module.createPool({
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    database: cfg.database,
    waitForConnections: true,
    connectionLimit: 1,
    namedPlaceholders: false,
    disableEval: true,
    stream: () => createSocket(cfg.host, cfg.port, { tls: cfg.ssl }),
  });
};

const normalizeResult = (rows: unknown): unknown => {
  if (Array.isArray(rows)) {
    return { rows: rows as Record<string, unknown>[], rowCount: rows.length };
  }
  if (rows !== null && rows !== undefined && typeof rows === 'object') {
    const input = rows as { affectedRows?: number; insertId?: number | string | bigint };
    const affectedRows = Number.isFinite(input.affectedRows) ? Number(input.affectedRows) : 0;
    const insertId = input.insertId;
    const lastInsertId =
      typeof insertId === 'number' || typeof insertId === 'string' || typeof insertId === 'bigint'
        ? insertId
        : undefined;
    return { rows: [], rowCount: affectedRows, lastInsertId };
  }
  return { rows: [], rowCount: 0 };
};

const initialize = async (input: Record<string, unknown>): Promise<void> => {
  config = normalizeConfig(input);
  await Promise.resolve();
};

const execute = async (command: string, params: unknown[], method?: string): Promise<unknown> => {
  if (command.trim() === '') {
    throw ErrorFactory.createValidationError('MySqlPoolDriver: SQL command is required');
  }

  const pool = await createPool();
  try {
    const op = (method ?? 'query').toLowerCase();
    const [rows] =
      op === 'execute' ? await pool.execute(command, params) : await pool.query(command, params);
    return normalizeResult(rows);
  } finally {
    try {
      await pool.end();
    } catch (error) {
      Logger.warn('[MySqlPoolDriver] Failed to close pool', error);
    }
  }
};

const health = async (): Promise<PoolDriverHealth> => {
  try {
    const pool = await createPool();
    await pool.execute('SELECT 1', []);
    await pool.end();
    return { connected: true };
  } catch (error) {
    Logger.warn('[MySqlPoolDriver] Health check failed', error);
    return { connected: false, meta: { error: String(error) } };
  }
};

const teardown = async (): Promise<void> => {
  config = null;
  await Promise.resolve();
};

export const MySqlPoolDriver: PoolDriver = Object.freeze({
  name: 'mysql',
  initialize,
  execute,
  teardown,
  health,
});

PoolRegistry.register(MySqlPoolDriver);
