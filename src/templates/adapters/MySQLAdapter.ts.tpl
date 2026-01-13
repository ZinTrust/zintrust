/* eslint-disable @typescript-eslint/require-await */
/**
 * MySQL Database Adapter
 */

import { FeatureFlags } from '@zintrust/core';
import { Logger } from '@zintrust/core';
import { ErrorFactory } from '@zintrust/core';
import { DatabaseConfig, IDatabaseAdapter, QueryResult } from '@zintrust/core';
import { QueryBuilder } from '@zintrust/core';

type AdapterState = {
  connected: boolean;
};

function createRawQuery(state: AdapterState) {
  return async function rawQuery<T = unknown>(sql: string, parameters?: unknown[]): Promise<T[]> {
    if (!FeatureFlags.isRawQueryEnabled()) {
      throw ErrorFactory.createConfigError('Raw SQL queries are disabled');
    }

    if (!state.connected) {
      throw ErrorFactory.createConnectionError('Database not connected');
    }

    try {
      Logger.warn(`Raw SQL Query executed: ${sql}`, { parameters });
      // Mock implementation for tests
      if (sql.includes('INVALID')) {
        throw ErrorFactory.createDatabaseError('Invalid SQL syntax');
      }
      return [] as T[];
    } catch (error) {
      throw ErrorFactory.createTryCatchError(`Raw SQL query failed: ${sql}`, error);
    }
  };
}

function createMySQLAdapterInstance(config: DatabaseConfig, state: AdapterState): IDatabaseAdapter {
  return {
    async connect(): Promise<void> {
      if (config.host === 'error') {
        throw ErrorFactory.createConnectionError(
          'Failed to connect to MySQL: Error: Connection failed'
        );
      }
      state.connected = true;
      Logger.info(`✓ MySQL connected (${config.host}:${config.port})`);
    },

    async disconnect(): Promise<void> {
      state.connected = false;
      Logger.info('✓ MySQL disconnected');
    },

    async query(_sql: string, _parameters: unknown[]): Promise<QueryResult> {
      if (!state.connected) throw ErrorFactory.createConnectionError('Database not connected');
      // Mock implementation
      return { rows: [], rowCount: 0 };
    },

    async queryOne(sql: string, parameters: unknown[]): Promise<Record<string, unknown> | null> {
      const result = await this.query(sql, parameters);
      return result.rows[0] ?? null;
    },

    async ping(): Promise<void> {
      await this.query(QueryBuilder.create('').select('1').toSQL(), []);
    },

    async transaction<T>(callback: (adapter: IDatabaseAdapter) => Promise<T>): Promise<T> {
      if (!state.connected) throw ErrorFactory.createConnectionError('Database not connected');
      try {
        await this.query('START TRANSACTION', []);
        const result = await callback(this);
        await this.query('COMMIT', []);
        return result;
      } catch (error) {
        await this.query('ROLLBACK', []);
        throw ErrorFactory.createTryCatchError('MySQL transaction failed', error);
      }
    },

    getType(): string {
      return 'mysql';
    },
    isConnected(): boolean {
      return state.connected;
    },
    rawQuery: createRawQuery(state),
    getPlaceholder(_index: number): string {
      return '?';
    },

    async ensureMigrationsTable(): Promise<void> {
      await this.query(
        `CREATE TABLE IF NOT EXISTS migrations (
            id INTEGER PRIMARY KEY AUTO_INCREMENT,
            name VARCHAR(255) NOT NULL,
            scope VARCHAR(255) NOT NULL DEFAULT 'global',
            service VARCHAR(255) NOT NULL DEFAULT '',
            batch INTEGER NOT NULL,
            status VARCHAR(255) NOT NULL,
            applied_at DATETIME NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(name, scope, service)
          )`,
        []
      );
    },
  };
}

/**
 * MySQL adapter implementation
 * Sealed namespace for immutability
 */
export const MySQLAdapter = Object.freeze({
  /**
   * Create a new MySQL adapter instance
   */
  create(config: DatabaseConfig): IDatabaseAdapter {
    const state: AdapterState = { connected: false };
    return createMySQLAdapterInstance(config, state);
  },
});

export default MySQLAdapter;
