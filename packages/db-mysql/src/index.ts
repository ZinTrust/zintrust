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

type AdapterState = {
  connected: boolean;
};

function connect(state: AdapterState, config: DatabaseConfig): void {
  if (config.host === 'error') {
    throw ErrorFactory.createConnectionError(
      'Failed to connect to MySQL: Error: Connection failed'
    );
  }
  state.connected = true;
  Logger.info(`✓ MySQL connected (${config.host}:${config.port})`);
}

function disconnect(state: AdapterState): void {
  state.connected = false;
  Logger.info('✓ MySQL disconnected');
}

function ensureConnected(state: AdapterState): void {
  if (!state.connected) throw ErrorFactory.createConnectionError('Database not connected');
}

async function rawQuery<T>(state: AdapterState, sql: string, parameters?: unknown[]): Promise<T[]> {
  if (!FeatureFlags.isRawQueryEnabled()) {
    throw ErrorFactory.createConfigError('Raw SQL queries are disabled');
  }

  ensureConnected(state);

  try {
    Logger.warn(`Raw SQL Query executed: ${sql}`, { parameters });
    if (sql.includes('INVALID')) {
      throw ErrorFactory.createDatabaseError('Invalid SQL syntax');
    }
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
    query: async () => {
      ensureConnected(state);
      return { rows: [], rowCount: 0 };
    },
    queryOne: async (sql, parameters) => {
      const result = await adapter.query(sql, parameters);
      return result.rows[0] ?? null;
    },
    ping: async () => {
      await adapter.query(QueryBuilder.create('').select('1').toSQL(), []);
    },
    transaction: async (callback) => {
      ensureConnected(state);
      try {
        await adapter.query('START TRANSACTION', []);
        const result = await callback(adapter);
        await adapter.query('COMMIT', []);
        return result;
      } catch (error) {
        await adapter.query('ROLLBACK', []);
        throw ErrorFactory.createTryCatchError('MySQL transaction failed', error);
      }
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
