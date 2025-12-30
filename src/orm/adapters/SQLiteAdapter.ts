// TEMPLATE_START
/* eslint-disable @typescript-eslint/require-await */
/**
 * SQLite Database Adapter
 * Production Implementation
 */

import { FeatureFlags } from '@config/features';
import { Logger } from '@config/logger';
import { ErrorFactory } from '@exceptions/ZintrustError';
import { performance } from '@node-singletons/perf-hooks';
import { DatabaseConfig, IDatabaseAdapter, QueryResult } from '@orm/DatabaseAdapter';
import Database from 'better-sqlite3';

function normalizeFilename(database: string | null | undefined): string {
  const value = (database ?? '').trim();
  return value.length > 0 ? value : ':memory:';
}

function isSelectQuery(sql: string): boolean {
  return sql.trimStart().toLowerCase().startsWith('select');
}

function requireDb(db: Database.Database | null): Database.Database {
  if (db === null) throw ErrorFactory.createConnectionError('Database not connected');
  return db;
}

function executeQuery(
  db: Database.Database,
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

function executeRawQuery<T>(
  db: Database.Database,
  sql: string,
  parameters: readonly unknown[]
): T[] {
  const stmt = db.prepare(sql);
  if (isSelectQuery(sql)) return stmt.all(parameters) as T[];
  stmt.run(parameters);
  return [];
}

type SQLiteAdapterState = {
  db: Database.Database | null;
  config: DatabaseConfig;
};

async function connectSQLite(state: SQLiteAdapterState): Promise<void> {
  if (state.db !== null) return;

  const filename = normalizeFilename(state.config.database);
  state.db = new Database(filename);

  // Enable WAL mode for better concurrency
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
  callback: (adapter: IDatabaseAdapter, db: Database.Database) => Promise<T>
): Promise<T> {
  const currentDb = requireDb(state.db);

  await adapter.query('BEGIN', []);
  try {
    const result = await callback(adapter, currentDb);
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
    async connect(): Promise<void> {
      await connectSQLite(state);
    },

    async disconnect(): Promise<void> {
      await disconnectSQLite(state);
    },

    async query(sql: string, parameters: unknown[] = []): Promise<QueryResult> {
      return querySQLite(state, sql, parameters);
    },

    async queryOne(
      sql: string,
      parameters: unknown[] = []
    ): Promise<Record<string, unknown> | null> {
      const result = await adapter.query(sql, parameters);
      return result.rows[0] ?? null;
    },

    async ping(): Promise<void> {
      await adapter.query('SELECT 1', []);
    },

    async transaction<T>(
      callback: (adapter: IDatabaseAdapter, db: Database.Database) => Promise<T>
    ): Promise<T> {
      return transactionSQLite(state, adapter, callback);
    },

    async rawQuery<T = unknown>(sql: string, parameters: unknown[] = []): Promise<T[]> {
      return rawQuerySQLite<T>(state, sql, parameters);
    },

    getType(): string {
      return 'sqlite';
    },

    isConnected(): boolean {
      return Boolean(state.db);
    },

    getPlaceholder(_index: number): string {
      return '?';
    },
  };

  return adapter;
}

export const SQLiteAdapter = Object.freeze({
  create: createSQLiteAdapter,
});
// TEMPLATE_END
