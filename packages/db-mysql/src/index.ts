import { ErrorFactory, FeatureFlags, Logger, QueryBuilder } from '@zintrust/core';

export type DatabaseConfig = {
  driver: 'sqlite' | 'postgresql' | 'mysql' | 'sqlserver' | 'd1';
  database?: string;
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  synchronize?: boolean;
  logging?: boolean;
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
  return (await import('mysql2/promise')) as unknown as MySqlModule;
}

function getConnectionParams(config: DatabaseConfig): {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
} {
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

    // Probe.
    await state.pool.execute('SELECT 1');
    state.connected = true;
    Logger.info(`✓ MySQL connected (${host}:${port})`);
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

function createMySqlAdapter(config: DatabaseConfig): IDatabaseAdapter {
  const state: AdapterState = { connected: false };

  const adapter: IDatabaseAdapter = {
    connect: async () => connect(state, config),
    disconnect: async () => disconnect(state),
    query: async (sql: string, parameters: unknown[]) => {
      const pool = ensurePool(state);
      try {
        const [rows] = await pool.execute(sql, parameters);
        return normalizeQueryResult(rows);
      } catch (error) {
        throw ErrorFactory.createTryCatchError(`MySQL query failed: ${sql}`, error);
      }
    },
    queryOne: async (sql, parameters) => {
      const result = await adapter.query(sql, parameters);
      return result.rows[0] ?? null;
    },
    ping: async () => {
      await adapter.query(QueryBuilder.create('').select('1').toSQL(), []);
    },
    transaction: async (callback) => {
      const pool = ensurePool(state);
      const conn = await pool.getConnection();

      const txAdapter: IDatabaseAdapter = {
        ...adapter,
        query: async (sql: string, parameters: unknown[]) => {
          try {
            const [rows] = await conn.execute(sql, parameters);
            return normalizeQueryResult(rows);
          } catch (error) {
            throw ErrorFactory.createTryCatchError(`MySQL query failed: ${sql}`, error);
          }
        },
        queryOne: async (sql: string, parameters: unknown[]) => {
          const res = await txAdapter.query(sql, parameters);
          return res.rows[0] ?? null;
        },
      };

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
    ensureMigrationsTable: async () => {
      await adapter.query(
        `CREATE TABLE IF NOT EXISTS migrations (
            id BIGINT PRIMARY KEY AUTO_INCREMENT,
            name VARCHAR(255) NOT NULL,
            scope VARCHAR(255) NOT NULL DEFAULT 'global',
            service VARCHAR(255) NOT NULL DEFAULT '',
            batch INTEGER NOT NULL,
            status VARCHAR(255) NOT NULL,
            applied_at DATETIME NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(name, scope, service)
          )`,
        []
      );
    },
    getType: () => 'mysql',
    isConnected: () => state.connected,
    rawQuery: async <T = unknown>(sql: string, parameters?: unknown[]) =>
      rawQuery<T>(state, sql, parameters),
    getPlaceholder: (_index: number) => '?',
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
