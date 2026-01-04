import { Cloudflare, ErrorFactory, FeatureFlags, Logger, QueryBuilder } from '@zintrust/core';

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
  if (db === null) throw ErrorFactory.createConfigError('D1 database binding not found');
  return db;
}

async function queryD1(
  config: DatabaseConfig,
  sql: string,
  parameters: unknown[]
): Promise<QueryResult> {
  const db = requireD1(config);
  try {
    const stmt = db.prepare(sql);
    const result = await stmt.bind(...parameters).all();
    const rows = (result.results as Record<string, unknown>[]) ?? [];
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
    const result = await stmt.bind(...parameters).first<Record<string, unknown>>();
    return result ?? null;
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
    Logger.warn(`Raw SQL Query executed: ${sql}`, { parameters });
    const stmt = db.prepare(sql);
    const result = await stmt.bind(...(parameters ?? [])).all<T>();
    return (result.results as T[]) ?? [];
  } catch (error) {
    throw ErrorFactory.createTryCatchError(`Raw SQL query failed: ${sql}`, error);
  }
}

function createD1Adapter(config: DatabaseConfig): IDatabaseAdapter {
  const state: AdapterState = { connected: false, config };

  const adapter: IDatabaseAdapter = {
    connect: async () => {
      state.connected = true;
      Logger.info('✓ D1 connected');
    },
    disconnect: async () => {
      state.connected = false;
      Logger.info('✓ D1 disconnected');
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
