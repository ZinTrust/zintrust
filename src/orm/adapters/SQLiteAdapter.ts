/* eslint-disable @typescript-eslint/require-await */
/**
 * SQLite Database Adapter
 * Production Implementation
 */

import { databaseConfig } from '@config/database';
import { FeatureFlags } from '@config/features';
import { Logger } from '@config/logger';
import { ErrorFactory } from '@exceptions/ZintrustError';
import fs from '@node-singletons/fs';
import * as path from '@node-singletons/path';
import { performance } from '@node-singletons/perf-hooks';
import type { DatabaseConfig, IDatabaseAdapter, QueryResult } from '@orm/DatabaseAdapter';
import { QueryBuilder } from '@orm/QueryBuilder';

type SqliteRunInfo = { changes: number; lastInsertRowid: number | bigint };
type SqliteStatement = {
  all: (params?: readonly unknown[]) => unknown[];
  run: (params?: readonly unknown[]) => SqliteRunInfo;
};
type SqliteDatabase = {
  prepare: (sql: string) => SqliteStatement;
  pragma: (value: string) => void;
  close: () => void;
};

type SqliteIdentifier = string & { readonly __sqliteIdentifier: unique symbol };

const SAFE_SQLITE_IDENTIFIER = /^[A-Za-z_]\w*$/;

const toSqliteIdentifier = (value: string): SqliteIdentifier => {
  if (!SAFE_SQLITE_IDENTIFIER.test(value)) {
    throw ErrorFactory.createDatabaseError('Unsafe sqlite identifier');
  }
  return value as SqliteIdentifier;
};

const quoteSqliteIdentifier = (id: SqliteIdentifier): string => {
  // Safe due to SAFE_SQLITE_IDENTIFIER allowlist.
  return `"${id}"`;
};

function isMissingEsmPackage(error: unknown, packageName: string): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const maybe = error as { code?: unknown; message?: unknown };
  const code = typeof maybe.code === 'string' ? maybe.code : '';
  const message = typeof maybe.message === 'string' ? maybe.message : '';
  // Some runners/wrappers preserve `code` but sanitize/omit the message.
  if (code === 'ERR_MODULE_NOT_FOUND' && message.length === 0) return true;
  if (code === 'ERR_MODULE_NOT_FOUND' && message.includes(`'${packageName}'`)) return true;
  if (message.includes(`Cannot find package '${packageName}'`)) return true;
  return false;
}

async function importSqliteDatabaseConstructor(): Promise<
  new (filename: string) => SqliteDatabase
> {
  try {
    // Avoid a literal dynamic import so bundlers (e.g. Wrangler/esbuild) don't
    // try to bundle the native sqlite driver into non-Node targets.
    const pkg = (globalThis as unknown as { __zintrustSqliteDriver?: string })
      .__zintrustSqliteDriver;
    const mod = (await import(pkg ?? 'better-sqlite3')) as unknown as {
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
    if (databaseConfig.logging.enabled) {
      Logger.debug('SQLite query executed', { durationMs: performance.now() - start, sql });
    }
    return { rows, rowCount: rows.length };
  }

  const info = stmt.run(parameters);
  if (databaseConfig.logging.enabled) {
    Logger.debug('SQLite query executed', { durationMs: performance.now() - start, sql });
  }
  return { rows: [], rowCount: info.changes, lastInsertId: info.lastInsertRowid };
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

  // Ensure file-backed sqlite DB directories exist (e.g. .zintrust/dbs/*.sqlite).
  if (filename !== ':memory:') {
    try {
      fs.mkdirSync(path.dirname(filename), { recursive: true });
    } catch (error) {
      throw ErrorFactory.createTryCatchError('Failed to create SQLite database directory', {
        filename,
        cause: error,
      });
    }
  }

  const SqliteDatabaseCtor = await importSqliteDatabaseConstructor();
  state.db = new SqliteDatabaseCtor(filename);

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
  callback: (adapter: IDatabaseAdapter, db: SqliteDatabase) => Promise<T>
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
      await adapter.query(QueryBuilder.create('').select('1').toSQL(), []);
    },

    async transaction<T>(
      callback: (adapter: IDatabaseAdapter, db: SqliteDatabase) => Promise<T>
    ): Promise<T> {
      return transactionSQLite(state, adapter, callback);
    },

    async rawQuery<T = unknown>(sql: string, parameters: unknown[] = []): Promise<T[]> {
      return rawQuerySQLite<T>(state, sql, parameters);
    },

    async ensureMigrationsTable(): Promise<void> {
      await adapter.query(
        `CREATE TABLE IF NOT EXISTS migrations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          scope TEXT NOT NULL DEFAULT 'global',
          service TEXT NOT NULL DEFAULT '',
          batch INTEGER NOT NULL,
          status TEXT NOT NULL,
          applied_at TEXT NULL,
          created_at TEXT NOT NULL,
          UNIQUE(name, scope, service)
        )`,
        []
      );
    },

    async resetSchema(): Promise<void> {
      // Best-effort for SQLite.
      await adapter.query('PRAGMA foreign_keys = OFF', []);

      const tables = (await adapter.query(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
        []
      )) as unknown as { rows: Array<{ name?: unknown }> };

      await Promise.all(
        tables.rows.map(async (t) => {
          const name = typeof t.name === 'string' ? t.name : '';
          if (name.length === 0) return;
          const tableName = toSqliteIdentifier(name);
          await adapter.query(`DROP TABLE IF EXISTS ${quoteSqliteIdentifier(tableName)}`, []);
        })
      );

      await adapter.query('PRAGMA foreign_keys = ON', []);
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
