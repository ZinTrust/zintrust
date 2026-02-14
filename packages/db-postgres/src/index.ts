import { Cloudflare, ErrorFactory, FeatureFlags, Logger, QueryBuilder } from '@zintrust/core';

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

/**
 * Minimal Pool interface to avoid importing pg types.
 */
type PgPool = {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[]; rowCount?: number }>;
  end: () => Promise<void>;
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

export const PostgreSQLAdapter = Object.freeze({
  create(config: DatabaseConfig): IDatabaseAdapter {
    return createPostgresAdapter(config);
  },
});

type AdapterState = {
  connected: boolean;
  pool?: PgPool;
};

type CloudflareSocketFactory = (options: {
  host: string;
  port: number;
  tls: boolean;
  timeoutMs: number;
}) => unknown;

function getConnectionParams(config: DatabaseConfig): {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
} {
  return {
    host: config.host ?? 'localhost',
    port: config.port ?? 5432,
    database: config.database ?? 'postgres',
    user: config.username ?? 'postgres',
    password: config.password ?? '',
  };
}

async function loadPgPoolCtor(): Promise<{ Pool: new (cfg: unknown) => PgPool }> {
  // Dynamic import keeps this package usable even if pg is missing.
  return (await import('pg')) as unknown as { Pool: new (cfg: unknown) => PgPool };
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

function ensurePool(state: AdapterState): PgPool {
  if (!state.connected || state.pool === undefined) {
    throw ErrorFactory.createConnectionError('Database not connected');
  }
  return state.pool;
}

async function connect(state: AdapterState, config: DatabaseConfig): Promise<void> {
  if (state.connected) return;

  try {
    const { Pool } = await loadPgPoolCtor();
    const { host, port, database, user, password } = getConnectionParams(config);
    const workersEnv = Cloudflare.getWorkersEnv();
    const isWorkersRuntime = workersEnv !== null;
    const tlsEnabled = Boolean((config as { ssl?: boolean }).ssl);
    const timeoutMs =
      typeof (config as { socketTimeoutMs?: number }).socketTimeoutMs === 'number'
        ? (config as { socketTimeoutMs?: number }).socketTimeoutMs
        : 30000;

    if (isWorkersRuntime) {
      if (!Cloudflare.isCloudflareSocketsEnabled()) {
        throw ErrorFactory.createConfigError(
          'Cloudflare sockets are disabled. Set ENABLE_CLOUDFLARE_SOCKETS=true to use PostgreSQL sockets on Workers.'
        );
      }
      const createSocket = await loadCloudflareSocketFactory();
      state.pool = new Pool({
        host,
        port,
        database,
        user,
        password,
        stream: (): unknown =>
          createSocket({ host, port, tls: tlsEnabled, timeoutMs: Number(timeoutMs) }),
      });
    } else {
      state.pool = new Pool({ host, port, database, user, password });
    }
    await state.pool.query('SELECT 1');
    state.connected = true;

    Logger.info(`✓ PostgreSQL connected (${host}:${port})`);
  } catch (error) {
    if (isMissingEsmPackage(error, 'pg')) {
      throw ErrorFactory.createConfigError(
        "PostgreSQL adapter requires the 'pg' package (run `zin add db:postgres` or `npm install pg`)."
      );
    }
    throw ErrorFactory.createTryCatchError('Failed to connect to PostgreSQL', error);
  }
}

async function disconnect(state: AdapterState): Promise<void> {
  if (!state.connected) return;
  const current = state.pool;
  state.pool = undefined;
  state.connected = false;

  if (current !== undefined) {
    await current.end();
  }

  Logger.info('✓ PostgreSQL disconnected');
}

async function query(
  state: AdapterState,
  sql: string,
  parameters: unknown[]
): Promise<QueryResult> {
  const current = ensurePool(state);
  try {
    // Convert ? placeholders to PostgreSQL's $1, $2, etc format
    let paramIndex = 0;
    const processedSql = sql.replaceAll('?', () => {
      paramIndex++;
      return `$${paramIndex}`;
    });

    const result = await current.query(processedSql, parameters);
    return {
      rows: (result.rows ?? []) as Record<string, unknown>[],
      rowCount: result.rowCount ?? result.rows?.length ?? 0,
    };
  } catch (error) {
    throw ErrorFactory.createTryCatchError('PostgreSQL query failed', error);
  }
}

async function transaction<T>(
  state: AdapterState,
  adapter: IDatabaseAdapter,
  callback: (adapter: IDatabaseAdapter) => Promise<T>
): Promise<T> {
  if (!state.connected) throw ErrorFactory.createConnectionError('Database not connected');

  try {
    await adapter.query('BEGIN', []);
    const result = await callback(adapter);
    await adapter.query('COMMIT', []);
    return result;
  } catch (error) {
    await adapter.query('ROLLBACK', []);
    throw ErrorFactory.createTryCatchError('PostgreSQL transaction failed', error);
  }
}

async function rawQuery<T>(
  adapter: IDatabaseAdapter,
  sql: string,
  parameters?: unknown[]
): Promise<T[]> {
  if (!FeatureFlags.isRawQueryEnabled()) {
    throw ErrorFactory.createConfigError(
      'Raw SQL queries are disabled. Set USE_RAW_QRY=true environment variable to enable.'
    );
  }

  const result = await adapter.query(sql, parameters ?? []);
  return result.rows as unknown as T[];
}

function createPostgresAdapter(config: DatabaseConfig): IDatabaseAdapter {
  const state: AdapterState = { connected: false, pool: undefined };

  const adapter: IDatabaseAdapter = {
    connect: async () => connect(state, config),
    disconnect: async () => disconnect(state),
    query: async (sql, parameters) => query(state, sql, parameters),
    queryOne: async (sql, parameters) => {
      const result = await adapter.query(sql, parameters);
      return result.rows[0] ?? null;
    },
    ping: async () => {
      await adapter.query(QueryBuilder.create('').select('1').toSQL(), []);
    },
    transaction: async (callback) => transaction(state, adapter, callback),
    rawQuery: async (sql, parameters) => rawQuery(adapter, sql, parameters),
    ensureMigrationsTable: async () => {
      await adapter.query(
        `CREATE TABLE IF NOT EXISTS migrations (
            id SERIAL PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            scope VARCHAR(255) NOT NULL DEFAULT 'global',
            service VARCHAR(255) NOT NULL DEFAULT '',
            batch INTEGER NOT NULL,
            status VARCHAR(255) NOT NULL,
            applied_at TIMESTAMP NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(name, scope, service)
          )`,
        []
      );
    },
    getType: () => 'postgresql',
    isConnected: () => state.connected,
    getPlaceholder: (index) => `$${index}`,
  };

  return adapter;
}

export default PostgreSQLAdapter;

/**
 * Package version and build metadata
 * Available at runtime for debugging and health checks
 */
export const _ZINTRUST_DB_POSTGRES_VERSION = '0.1.15';
export const _ZINTRUST_DB_POSTGRES_BUILD_DATE = '__BUILD_DATE__';
