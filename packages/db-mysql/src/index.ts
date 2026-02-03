import { Cloudflare, ErrorFactory, FeatureFlags, Logger, QueryBuilder } from '@zintrust/core';
import { MySqlWorkersDurableObjectAdapter } from './MySqlWorkersDurableObjectAdapter.js';
import { CREATE_MIGRATIONS_TABLE_SQL, MYSQL_PLACEHOLDER, MYSQL_TYPE } from './common.js';

export type DatabaseConfig = {
  driver: 'sqlite' | 'postgresql' | 'mysql' | 'sqlserver' | 'd1';
  database?: string;
  connectionString?: string;
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  synchronize?: boolean;
  logging?: boolean;
  ssl?: boolean;
  socketTimeoutMs?: number;
  readHosts?: string[];
};

export type QueryResult = {
  rows: Record<string, unknown>[];
  rowCount: number;
  lastInsertId?: string | number | bigint;
};

export interface IDatabaseAdapter {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  query(sql: string, parameters: unknown[]): Promise<QueryResult>;
  queryOne(sql: string, parameters: unknown[]): Promise<Record<string, unknown> | null>;
  ping(): Promise<void>;
  transaction<T>(callback: (adapter: IDatabaseAdapter) => Promise<T>): Promise<T>;
  rawQuery<T = unknown>(sql: string, parameters?: unknown[]): Promise<T[]>;
  ensureMigrationsTable?(): Promise<void>;
  getType(): string;
  isConnected(): boolean;
  getPlaceholder(index: number): string;
}

type AdapterState = {
  connected: boolean;
  pool?: MySqlPool;
};

type MySqlPool = {
  execute: (sql: string, params?: unknown[]) => Promise<[unknown, unknown]>;
  end: () => Promise<void>;
  getConnection: () => Promise<MySqlPoolConnection>;
};

type MySqlPoolConnection = {
  execute: (sql: string, params?: unknown[]) => Promise<[unknown, unknown]>;
  beginTransaction: () => Promise<void>;
  commit: () => Promise<void>;
  rollback: () => Promise<void>;
  release: () => void;
};

type MySqlModule = {
  createPool: (config: unknown) => MySqlPool;
};

const getInjectedMysqlModule = (): MySqlModule | undefined => {
  const globalAny = globalThis as { __zintrustMysqlModule?: MySqlModule };
  return globalAny.__zintrustMysqlModule;
};

type CloudflareSocketFactory = (options: {
  host: string;
  port: number;
  tls: boolean;
  timeoutMs: number;
}) => unknown;

function isMissingEsmPackage(error: unknown, packageName: string): boolean {
  if (error === null || typeof error !== 'object') return false;
  const maybe = error as { code?: unknown; message?: unknown };

  if (maybe.code === 'ERR_MODULE_NOT_FOUND') {
    return typeof maybe.message === 'string' && maybe.message.includes(packageName);
  }

  if (typeof maybe.message === 'string') {
    return (
      maybe.message.includes(`Cannot find package '${packageName}'`) ||
      maybe.message.includes(`Cannot find module '${packageName}'`)
    );
  }

  return false;
}

async function loadMysql(): Promise<MySqlModule> {
  const injected = getInjectedMysqlModule();
  if (injected) return injected;
  return (await import('mysql2/promise')) as unknown as MySqlModule;
}

async function loadCloudflareSocketFactory(): Promise<CloudflareSocketFactory> {
  try {
    const { CloudflareSocket } = await import('@zintrust/core');
    return ({ host, port, tls, timeoutMs }) =>
      CloudflareSocket.create(host, port, { tls, timeoutMs });
  } catch (error) {
    throw ErrorFactory.createConfigError(
      'Cloudflare Workers socket support requires cloudflare:sockets compatibility (set compatibility_date >= 2024-01-15).',
      error
    );
  }
}

function getConnectionParams(config: DatabaseConfig): {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
} {
  if (config.connectionString !== undefined && config.connectionString.trim() !== '') {
    try {
      const url = new URL(config.connectionString);
      const database = url.pathname.replace(/^\//, '') || 'mysql';
      return {
        host: url.hostname || 'localhost',
        port: url.port ? Number.parseInt(url.port, 10) : 3306,
        database,
        user: decodeURIComponent(url.username || 'root'),
        password: decodeURIComponent(url.password || ''),
      };
    } catch (error) {
      throw ErrorFactory.createConfigError('Invalid MySQL connection string', error);
    }
  }

  return {
    host: config.host ?? 'localhost',
    port: config.port ?? 3306,
    database: config.database ?? 'mysql',
    user: config.username ?? 'root',
    password: config.password ?? '',
  };
}

function ensurePool(state: AdapterState): MySqlPool {
  if (!state.connected || state.pool === undefined) {
    throw ErrorFactory.createConnectionError('Database not connected');
  }
  return state.pool;
}

function normalizeQueryResult(raw: unknown): QueryResult {
  // mysql2/promise returns:
  // - SELECT: RowDataPacket[]
  // - INSERT/UPDATE: ResultSetHeader
  // We normalize to the framework's { rows, rowCount }.

  if (Array.isArray(raw)) {
    return {
      rows: raw as Record<string, unknown>[],
      rowCount: raw.length,
    };
  }

  if (raw !== null && typeof raw === 'object') {
    const maybe = raw as { affectedRows?: unknown; insertId?: unknown };
    const affectedRows =
      typeof maybe.affectedRows === 'number' && Number.isFinite(maybe.affectedRows)
        ? maybe.affectedRows
        : 0;

    const insertId =
      (typeof maybe.insertId === 'number' ||
        typeof maybe.insertId === 'string' ||
        typeof maybe.insertId === 'bigint') &&
      maybe.insertId !== 0 // Only return if valid ID
        ? maybe.insertId
        : undefined;

    return { rows: [], rowCount: affectedRows, lastInsertId: insertId };
  }

  return { rows: [], rowCount: 0 };
}

async function connect(state: AdapterState, config: DatabaseConfig): Promise<void> {
  if (state.connected) return;

  try {
    const mysql = await loadMysql();
    const { host, port, database, user, password } = getConnectionParams(config);
    const isWorkersRuntime = Cloudflare.getWorkersEnv() !== null;
    const tlsEnabled = Boolean((config as { ssl?: boolean }).ssl);
    let timeoutMs: number;

    if (typeof config.socketTimeoutMs === 'number' && config.socketTimeoutMs > 0) {
      timeoutMs = config.socketTimeoutMs;
    } else {
      timeoutMs = 30000; // default 30s
    }
    if (isWorkersRuntime) {
      if (!Cloudflare.isCloudflareSocketsEnabled()) {
        throw ErrorFactory.createConfigError(
          'Cloudflare sockets are disabled. Set ENABLE_CLOUDFLARE_SOCKETS=true to use MySQL sockets on Workers.'
        );
      }
      const createSocket = await loadCloudflareSocketFactory();
      state.pool = mysql.createPool({
        host,
        port,
        database,
        user,
        password,
        waitForConnections: true,
        connectionLimit: 10,
        namedPlaceholders: false,
        disableEval: true,
        stream: () => createSocket({ host, port, tls: tlsEnabled, timeoutMs }),
      });
    } else {
      state.pool = mysql.createPool({
        host,
        port,
        database,
        user,
        password,
        waitForConnections: true,
        connectionLimit: 10,
        namedPlaceholders: false,
      });
    }

    // Probe.
    await state.pool.execute('SELECT 1');
    state.connected = true;
    Logger.info(`✓ Cloudflare sockets MySQL connected (${host}:${port})`);
  } catch (error) {
    if (isMissingEsmPackage(error, 'mysql2')) {
      throw ErrorFactory.createConfigError(
        "MySQL adapter requires the 'mysql2' package (run `npm install mysql2` or `zin add db:mysql`)."
      );
    }
    throw ErrorFactory.createTryCatchError('Failed to connect to MySQL', error);
  }
}

async function disconnect(state: AdapterState): Promise<void> {
  if (!state.connected) return;
  const pool = state.pool;
  state.connected = false;
  state.pool = undefined;

  try {
    if (pool !== undefined) await pool.end();
  } finally {
    Logger.info('✓ MySQL disconnected');
  }
}

async function rawQuery<T>(state: AdapterState, sql: string, parameters?: unknown[]): Promise<T[]> {
  if (!FeatureFlags.isRawQueryEnabled()) {
    throw ErrorFactory.createConfigError('Raw SQL queries are disabled');
  }

  const pool = ensurePool(state);

  try {
    Logger.warn(`Raw SQL Query executed: ${sql}`, { parameters });
    const [rows] = await pool.execute(sql, parameters ?? []);
    if (Array.isArray(rows)) return rows as T[];
    return [] as T[];
  } catch (error) {
    throw ErrorFactory.createTryCatchError(`Raw SQL query failed: ${sql}`, error);
  }
}

const createTransactionAdapter = (
  baseAdapter: IDatabaseAdapter,
  conn: unknown
): IDatabaseAdapter => {
  return {
    ...baseAdapter,
    query: async (sql: string, parameters: unknown[]): Promise<QueryResult> => {
      try {
        const connection = conn as {
          execute: (sql: string, params: unknown[]) => Promise<[unknown]>;
        };
        const [rows] = await connection.execute(sql, parameters);
        return normalizeQueryResult(rows);
      } catch (error) {
        throw ErrorFactory.createTryCatchError(`MySQL query failed: ${sql}`, error);
      }
    },
    queryOne: async (
      sql: string,
      parameters: unknown[]
    ): Promise<Record<string, unknown> | null> => {
      const res = await baseAdapter.query(sql, parameters);
      return res.rows[0] ?? null;
    },
  };
};

const createMigrationsTable = async (adapter: IDatabaseAdapter): Promise<void> => {
  await adapter.query(CREATE_MIGRATIONS_TABLE_SQL, []);
};

function createMySqlAdapter(config: DatabaseConfig): IDatabaseAdapter {
  const globalEnv = (globalThis as { env?: Record<string, unknown> }).env;
  if (Cloudflare.getWorkersEnv() !== null && globalEnv?.['MYSQL_POOL']) {
    Logger.info('[MySQL] Using Durable Object pool adapter');
    return MySqlWorkersDurableObjectAdapter.create(config);
  }

  const state: AdapterState = { connected: false };

  const adapter: IDatabaseAdapter = {
    connect: async (): Promise<void> => connect(state, config),
    disconnect: async (): Promise<void> => disconnect(state),
    query: async (sql: string, parameters: unknown[]) => {
      const pool = ensurePool(state);
      try {
        const [rows] = await pool.execute(sql, parameters);
        return normalizeQueryResult(rows);
      } catch (error) {
        throw ErrorFactory.createTryCatchError(`MySQL query failed: ${sql}`, error);
      }
    },
    queryOne: async (sql: string, parameters: unknown[]) => {
      const result = await adapter.query(sql, parameters);
      return result.rows[0] ?? null;
    },
    ping: async (): Promise<void> => {
      await adapter.query(QueryBuilder.create('').select('1').toSQL(), []);
    },
    transaction: async <T>(callback: (adapter: IDatabaseAdapter) => Promise<T>): Promise<T> => {
      const pool = ensurePool(state);
      const conn = await pool.getConnection();

      const txAdapter = createTransactionAdapter(adapter, conn);

      try {
        await conn.beginTransaction();
        const result = await callback(txAdapter);
        await conn.commit();
        return result;
      } catch (error) {
        try {
          await conn.rollback();
        } catch {
          // ignore rollback errors
        }
        throw ErrorFactory.createTryCatchError('MySQL transaction failed', error);
      } finally {
        conn.release();
      }
    },
    ensureMigrationsTable: async (): Promise<void> => {
      await createMigrationsTable(adapter);
    },
    getType: (): string => MYSQL_TYPE,
    isConnected: (): boolean => state.connected,
    rawQuery: async <T = unknown>(sql: string, parameters?: unknown[]) =>
      rawQuery<T>(state, sql, parameters),
    getPlaceholder: (_index: number): string => MYSQL_PLACEHOLDER,
  };

  return adapter;
}

export const MySQLAdapter = Object.freeze({
  create: (config: DatabaseConfig) => createMySqlAdapter(config),
});

export default MySQLAdapter;

/**
 * Package version and build metadata
 * Available at runtime for debugging and health checks
 */
export const _ZINTRUST_DB_MYSQL_VERSION = '0.1.15';
export const _ZINTRUST_DB_MYSQL_BUILD_DATE = '__BUILD_DATE__';
