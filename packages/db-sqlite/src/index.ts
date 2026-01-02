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

type SqliteRunInfo = { changes: number };

type SqliteStatement = {
  all: (params?: readonly unknown[]) => unknown[];
  run: (params?: readonly unknown[]) => SqliteRunInfo;
};

type SqliteDatabase = {
  prepare: (sql: string) => SqliteStatement;
  pragma: (value: string) => void;
  close: () => void;
};

function isMissingEsmPackage(error: unknown, packageName: string): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const maybe = error as { code?: unknown; message?: unknown };
  const code = typeof maybe.code === 'string' ? maybe.code : '';
  const message = typeof maybe.message === 'string' ? maybe.message : '';
  if (code === 'ERR_MODULE_NOT_FOUND' && message.includes(`'${packageName}'`)) return true;
  if (message.includes(`Cannot find package '${packageName}'`)) return true;
  if (message.includes(`Cannot find module '${packageName}'`)) return true;
  return false;
}

async function importSqliteDatabaseConstructor(): Promise<
  new (filename: string) => SqliteDatabase
> {
  try {
    const mod = (await import('better-sqlite3')) as unknown as {
      default?: new (filename: string) => SqliteDatabase;
    };

    const ctor = (mod as unknown as { default?: unknown }).default;
    if (typeof ctor === 'function') return ctor as new (filename: string) => SqliteDatabase;

    // Some CJS packages may not present a `default` export under certain loaders.
    return mod as unknown as new (filename: string) => SqliteDatabase;
  } catch (error) {
    if (isMissingEsmPackage(error, 'better-sqlite3')) {
      throw ErrorFactory.createConfigError(
        "SQLite adapter requires the 'better-sqlite3' package (run `zin add db:sqlite` or `zin plugin install db:sqlite`)."
      );
    }

    throw ErrorFactory.createTryCatchError('Failed to load SQLite driver', { cause: error });
  }
}

function normalizeFilename(database: string | null | undefined): string {
  const value = (database ?? '').trim();
  return value.length > 0 ? value : ':memory:';
}

function isSelectQuery(sql: string): boolean {
  return sql.trimStart().toLowerCase().startsWith('select');
}

function requireDb(db: SqliteDatabase | null): SqliteDatabase {
  if (db === null) throw ErrorFactory.createConnectionError('Database not connected');
  return db;
}

function executeQuery(
  db: SqliteDatabase,
  sql: string,
  parameters: readonly unknown[]
): QueryResult {
  const start = performance.now();

  const stmt = db.prepare(sql);
  if (isSelectQuery(sql)) {
    const rows = stmt.all(parameters) as Record<string, unknown>[];
    Logger.debug('SQLite query executed', { durationMs: performance.now() - start, sql });
    return { rows, rowCount: rows.length };
  }

  const info = stmt.run(parameters);
  Logger.debug('SQLite query executed', { durationMs: performance.now() - start, sql });
  return { rows: [], rowCount: info.changes };
}

function executeRawQuery<T>(db: SqliteDatabase, sql: string, parameters: readonly unknown[]): T[] {
  const stmt = db.prepare(sql);
  if (isSelectQuery(sql)) return stmt.all(parameters) as T[];
  stmt.run(parameters);
  return [];
}

type SQLiteAdapterState = {
  db: SqliteDatabase | null;
  config: DatabaseConfig;
};

async function connectSQLite(state: SQLiteAdapterState): Promise<void> {
  if (state.db !== null) return;

  const filename = normalizeFilename(state.config.database);
  const SqliteDatabaseCtor = await importSqliteDatabaseConstructor();
  state.db = new SqliteDatabaseCtor(filename);

  state.db.pragma('journal_mode = WAL');
  Logger.info(`✓ SQLite connected (${filename})`);
}

async function disconnectSQLite(state: SQLiteAdapterState): Promise<void> {
  if (state.db === null) return;
  state.db.close();
  state.db = null;
  Logger.info('✓ SQLite disconnected');
}

async function querySQLite(
  state: SQLiteAdapterState,
  sql: string,
  parameters: readonly unknown[]
): Promise<QueryResult> {
  const currentDb = requireDb(state.db);

  try {
    return executeQuery(currentDb, sql, parameters);
  } catch (error: unknown) {
    throw ErrorFactory.createTryCatchError('Query failed', { sql, parameters, cause: error });
  }
}

async function rawQuerySQLite<T>(
  state: SQLiteAdapterState,
  sql: string,
  parameters: readonly unknown[]
): Promise<T[]> {
  if (!FeatureFlags.isRawQueryEnabled()) {
    throw ErrorFactory.createConfigError('Raw SQL queries are disabled');
  }

  const currentDb = requireDb(state.db);
  Logger.warn(`Raw SQL Query executed: ${sql}`);

  try {
    return executeRawQuery<T>(currentDb, sql, parameters);
  } catch (error: unknown) {
    throw ErrorFactory.createTryCatchError('Raw query failed', { sql, parameters, cause: error });
  }
}

async function transactionSQLite<T>(
  state: SQLiteAdapterState,
  adapter: IDatabaseAdapter,
  callback: (adapter: IDatabaseAdapter) => Promise<T>
): Promise<T> {
  requireDb(state.db);

  await adapter.query('BEGIN', []);
  try {
    const result = await callback(adapter);
    await adapter.query('COMMIT', []);
    return result;
  } catch (error: unknown) {
    await adapter.query('ROLLBACK', []);
    throw ErrorFactory.createTryCatchError('Transaction failed', { cause: error });
  }
}

function createSQLiteAdapter(config: DatabaseConfig): IDatabaseAdapter {
  const state: SQLiteAdapterState = { db: null, config };

  const adapter: IDatabaseAdapter = {
    connect: async () => connectSQLite(state),
    disconnect: async () => disconnectSQLite(state),
    query: async (sql, parameters = []) => querySQLite(state, sql, parameters),
    queryOne: async (sql, parameters = []) => {
      const result = await adapter.query(sql, parameters);
      return result.rows[0] ?? null;
    },
    ping: async () => {
      await adapter.query(QueryBuilder.create('').select('1').toSQL(), []);
    },
    transaction: async (callback) => transactionSQLite(state, adapter, callback),
    rawQuery: async (sql, parameters) => rawQuerySQLite(state, sql, parameters ?? []),
    getType: () => 'sqlite',
    isConnected: () => Boolean(state.db),
    getPlaceholder: (_index) => '?',
  };

  return adapter;
}

export const SQLiteAdapter = Object.freeze({
  create: createSQLiteAdapter,
});

export default SQLiteAdapter;
