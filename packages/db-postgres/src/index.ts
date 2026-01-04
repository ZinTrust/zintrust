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
};

export interface IDatabaseAdapter {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  query(sql: string, parameters: unknown[]): Promise<QueryResult>;
  queryOne(sql: string, parameters: unknown[]): Promise<Record<string, unknown> | null>;
  ping(): Promise<void>;
  transaction<T>(callback: (adapter: IDatabaseAdapter) => Promise<T>): Promise<T>;
  rawQuery<T = unknown>(sql: string, parameters?: unknown[]): Promise<T[]>;
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

    state.pool = new Pool({ host, port, database, user, password });
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
    const result = await current.query(sql, parameters);
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
    getType: () => 'postgresql',
    isConnected: () => state.connected,
    getPlaceholder: (index) => `$${index}`,
  };

  return adapter;
}

export default PostgreSQLAdapter;
