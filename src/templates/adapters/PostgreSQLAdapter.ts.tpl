/* eslint-disable @typescript-eslint/require-await */
/**
 * PostgreSQL Database Adapter
 */

import { FeatureFlags } from '@zintrust/core';
import { Logger } from '@zintrust/core';
import { ErrorFactory } from '@zintrust/core';
import { DatabaseConfig, IDatabaseAdapter, QueryResult } from '@zintrust/core';
import { QueryBuilder } from '@zintrust/core';

type AdapterState = {
  connected: boolean;
};

function assertConnected(state: AdapterState): void {
  if (!state.connected) throw ErrorFactory.createConnectionError('Database not connected');
}

async function pgConnect(config: DatabaseConfig, state: AdapterState): Promise<void> {
  if (config.host === 'error') {
    throw ErrorFactory.createConnectionError('Failed to connect to PostgreSQL: Connection failed');
  }
  state.connected = true;
  Logger.info(`✓ PostgreSQL connected (${config.host}:${config.port})`);
}

async function pgDisconnect(state: AdapterState): Promise<void> {
  state.connected = false;
  Logger.info('✓ PostgreSQL disconnected');
}

async function pgQuery(
  state: AdapterState,
  _sql: string,
  _parameters: unknown[]
): Promise<QueryResult> {
  assertConnected(state);
  // Mock implementation
  return { rows: [], rowCount: 0 };
}

async function pgQueryOne(
  adapter: IDatabaseAdapter,
  sql: string,
  parameters: unknown[]
): Promise<Record<string, unknown> | null> {
  const result = await adapter.query(sql, parameters);
  return result.rows[0] ?? null;
}

async function pgPing(adapter: IDatabaseAdapter): Promise<void> {
  await adapter.query(QueryBuilder.create('').select('1').toSQL(), []);
}

async function pgTransaction<T>(
  state: AdapterState,
  adapter: IDatabaseAdapter,
  callback: (adapter: IDatabaseAdapter) => Promise<T>
): Promise<T> {
  assertConnected(state);
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

async function pgRawQuery<T = unknown>(
  state: AdapterState,
  sql: string,
  parameters?: unknown[]
): Promise<T[]> {
  if (!FeatureFlags.isRawQueryEnabled()) {
    throw ErrorFactory.createConfigError(
      'Raw SQL queries are disabled. Set USE_RAW_QRY=true environment variable to enable.'
    );
  }

  assertConnected(state);

  Logger.warn(`Raw SQL Query executed: ${sql}`, { parameters });

  try {
    if (sql.toUpperCase().includes('INVALID')) {
      throw ErrorFactory.createDatabaseError('Invalid SQL syntax');
    }
    // Mock implementation
    return [] as T[];
  } catch (error) {
    throw ErrorFactory.createTryCatchError('Raw SQL Query failed', error);
  }
}

async function pgEnsureMigrationsTable(adapter: IDatabaseAdapter): Promise<void> {
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
}

function createAdapter(config: DatabaseConfig, state: AdapterState): IDatabaseAdapter {
  const adapter: IDatabaseAdapter = {
    connect: async () => pgConnect(config, state),
    disconnect: async () => pgDisconnect(state),
    query: async (sql, parameters) => pgQuery(state, sql, parameters),
    queryOne: async (sql, parameters) => pgQueryOne(adapter, sql, parameters),
    ping: async () => pgPing(adapter),
    transaction: async (callback) => pgTransaction(state, adapter, callback),
    getType: () => 'postgresql',
    isConnected: () => state.connected,
    rawQuery: async (sql, parameters) => pgRawQuery(state, sql, parameters),
    getPlaceholder: (index) => `$${index}`,
    ensureMigrationsTable: async () => pgEnsureMigrationsTable(adapter),
  };

  return adapter;
}

/**
 * PostgreSQL adapter implementation
 * Sealed namespace for immutability
 */
export const PostgreSQLAdapter = Object.freeze({
  /**
   * Create a new PostgreSQL adapter instance
   */
  create(config: DatabaseConfig): IDatabaseAdapter {
    const state: AdapterState = { connected: false };
    return createAdapter(config, state);
  },
});

export default PostgreSQLAdapter;
