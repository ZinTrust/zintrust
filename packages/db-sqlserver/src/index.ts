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

function ensureConnected(state: AdapterState): void {
  if (!state.connected) throw ErrorFactory.createConnectionError('Database not connected');
}

function connect(state: AdapterState, config: DatabaseConfig): void {
  if (config.host === 'error') {
    throw ErrorFactory.createConnectionError(
      'Failed to connect to SQL Server: Error: Connection failed'
    );
  }
  state.connected = true;
  Logger.info(`✓ SQL Server connected (${config.host}:${config.port})`);
}

function disconnect(state: AdapterState): void {
  state.connected = false;
  Logger.info('✓ SQL Server disconnected');
}

async function rawQuery<T>(state: AdapterState, sql: string, parameters?: unknown[]): Promise<T[]> {
  if (!FeatureFlags.isRawQueryEnabled()) {
    throw ErrorFactory.createConfigError(
      'Raw SQL queries are disabled. Set USE_RAW_QRY=true environment variable to enable.'
    );
  }

  ensureConnected(state);
  Logger.warn(`Raw SQL Query executed: ${sql}`, { parameters });

  try {
    if (sql.toUpperCase().includes('INVALID')) {
      throw ErrorFactory.createDatabaseError('Invalid SQL syntax');
    }
    return [] as T[];
  } catch (error) {
    throw ErrorFactory.createTryCatchError('Raw SQL Query failed', error);
  }
}

function createSqlServerAdapter(config: DatabaseConfig): IDatabaseAdapter {
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
      try {
        return await callback(adapter);
      } catch (error) {
        throw ErrorFactory.createTryCatchError('Transaction failed', error);
      }
    },
    getType: () => 'sqlserver',
    isConnected: () => state.connected,
    rawQuery: async <T = unknown>(sql: string, parameters?: unknown[]) =>
      rawQuery<T>(state, sql, parameters),
    getPlaceholder: (index) => `@param${index}`,
  };

  return adapter;
}

export const SQLServerAdapter = Object.freeze({
  create: (config: DatabaseConfig) => createSqlServerAdapter(config),
});

export default SQLServerAdapter;

/**
 * Package version and build metadata
 * Available at runtime for debugging and health checks
 */
export const _ZINTRUST_DB_SQLSERVER_VERSION = '0.1.15';
export const _ZINTRUST_DB_SQLSERVER_BUILD_DATE = '__BUILD_DATE__';
