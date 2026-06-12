import { Cloudflare } from '@zintrust/core/cloudflare';
import { FeatureFlags } from '@zintrust/core/config';
import { BaseAdapter, QueryBuilder } from '@zintrust/core/database';
import { ErrorFactory } from '@zintrust/core/errors';
import { Logger } from '@zintrust/core/logger';

export interface ID1Database {
  prepare(sql: string): {
    bind(...values: unknown[]): {
      all<T = unknown>(): Promise<{ results?: T[]; success: boolean; error?: string }>;
      first<T = unknown>(): Promise<T | null>;
      run(): Promise<{ success: boolean; error?: string }>;
    };
  };
}

export type DatabaseConfig = {
  d1?: ID1Database;
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

type AdapterState = {
  connected: boolean;
  config: DatabaseConfig;
};

function getD1Binding(config: DatabaseConfig): ID1Database | null {
  return Cloudflare.getD1Binding(config) as ID1Database | null;
}

function ensureConnected(state: AdapterState): void {
  if (!state.connected) throw ErrorFactory.createConnectionError('Database not connected');
}

function requireD1(config: DatabaseConfig): ID1Database {
  const db = getD1Binding(config);
  if (db === null) {
    const isWorkersRuntime = Cloudflare.getWorkersEnv() !== null;
    const message = isWorkersRuntime
      ? 'D1 database binding not found. Ensure your Worker has a D1 binding (for example `DB` or `zintrust_db`) and wrangler d1_databases.binding matches.'
      : 'D1 database binding not found. You are running outside Workers. Use `DB_CONNECTION=d1-remote` with D1_REMOTE_URL/D1_REMOTE_KEY_ID/D1_REMOTE_SECRET, or run in Workers mode (`zin s --wg`).';
    throw ErrorFactory.createConfigError(message);
  }
  return db;
}

/**
 * Normalize D1 bind parameters to handle integer-to-TEXT column compatibility.
 *
 * Workerd's D1 API binds every JavaScript number parameter as a float64 (REAL).
 * When SQLite compares a REAL operand against a column with TEXT affinity,
 * the operand is cast using the column's affinity, producing '2.0' — which
 * never equals a stored '2' from PHP/PDO.
 *
 * This function converts integer-valued numbers to their canonical decimal
 * string representation to match PHP/PDO behavior for TEXT columns.
 *
 * @param parameters - The bind parameters array
 * @returns Normalized parameters with integers as strings
 */
function normalizeD1BindParameters(parameters: unknown[]): unknown[] {
  if (!Array.isArray(parameters)) return parameters;
  return parameters.map((value) =>
    typeof value === 'number' && Number.isInteger(value) ? String(value) : value
  );
}

async function queryD1(
  config: DatabaseConfig,
  sql: string,
  parameters: unknown[]
): Promise<QueryResult> {
  const db = requireD1(config);
  try {
    const stmt = db.prepare(sql);
    const normalizedParams = normalizeD1BindParameters(parameters);
    const result = await stmt.bind(...normalizedParams).all();
    const rows = BaseAdapter.normalizeRows((result.results as Record<string, unknown>[]) ?? []);
    return { rows, rowCount: rows.length };
  } catch (error) {
    throw ErrorFactory.createTryCatchError(`D1 query failed: ${sql}`, error);
  }
}

async function queryOneD1(
  config: DatabaseConfig,
  sql: string,
  parameters: unknown[]
): Promise<Record<string, unknown> | null> {
  const db = requireD1(config);
  try {
    const stmt = db.prepare(sql);
    const normalizedParams = normalizeD1BindParameters(parameters);
    const result = await stmt.bind(...normalizedParams).first<Record<string, unknown>>();
    return result === null ? null : BaseAdapter.normalizeRow(result);
  } catch (error) {
    throw ErrorFactory.createTryCatchError(`D1 queryOne failed: ${sql}`, error);
  }
}

async function pingD1(config: DatabaseConfig): Promise<void> {
  const db = requireD1(config);
  try {
    await db.prepare(QueryBuilder.create('').select('1').toSQL()).bind().first();
  } catch (error) {
    throw ErrorFactory.createTryCatchError('D1 ping failed', error);
  }
}

async function rawQueryD1<T>(
  config: DatabaseConfig,
  sql: string,
  parameters?: unknown[]
): Promise<T[]> {
  if (!FeatureFlags.isRawQueryEnabled()) {
    throw ErrorFactory.createConfigError('Raw SQL queries are disabled');
  }

  const db = requireD1(config);

  try {
    Logger.warn(`Raw SQL Query executed: ${sql}`, Logger.withTraceSkipContext({ sql, parameters }));
    const stmt = db.prepare(sql);
    const normalizedParams = normalizeD1BindParameters(parameters ?? []);
    const result = await stmt.bind(...normalizedParams).all<T>();
    return result.results ?? [];
  } catch (error) {
    throw ErrorFactory.createTryCatchError(`Raw SQL query failed: ${sql}`, error);
  }
}

function createD1Adapter(config: DatabaseConfig): IDatabaseAdapter {
  const state: AdapterState = { connected: false, config };

  const adapter: IDatabaseAdapter = {
    connect: async () => {
      state.connected = true;
      Logger.debug('✓ D1 connected');
    },
    disconnect: async () => {
      state.connected = false;
      Logger.debug('✓ D1 disconnected');
    },
    query: async (sql, parameters) => {
      ensureConnected(state);
      return queryD1(state.config, sql, parameters);
    },
    queryOne: async (sql, parameters) => {
      ensureConnected(state);
      return queryOneD1(state.config, sql, parameters);
    },
    ping: async () => {
      ensureConnected(state);
      return pingD1(state.config);
    },
    transaction: async (callback) => {
      ensureConnected(state);
      try {
        return await callback(adapter);
      } catch (error) {
        throw ErrorFactory.createTryCatchError('Transaction failed', error);
      }
    },
    getType: () => 'd1',
    isConnected: () => state.connected,
    rawQuery: async <T = unknown>(sql: string, parameters?: unknown[]) => {
      ensureConnected(state);
      return rawQueryD1<T>(state.config, sql, parameters);
    },
    getPlaceholder: (_index: number) => '?',
  };

  return adapter;
}

export const D1Adapter = Object.freeze({
  create: (config: DatabaseConfig) => createD1Adapter(config),
});

export default D1Adapter;

/**
 * Package version and build metadata
 * Available at runtime for debugging and health checks
 */
export const _ZINTRUST_DB_D1_VERSION = '0.1.15';
export const _ZINTRUST_DB_D1_BUILD_DATE = '__BUILD_DATE__';
