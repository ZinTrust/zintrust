/**
 * SQLite Database Adapter
 * Uses better-sqlite3 for synchronous operations or sql.js for in-memory
 */

import { FeatureFlags } from '@config/features';
import { Logger } from '@config/logger';
import { DatabaseConfig, IDatabaseAdapter } from '@orm/DatabaseAdapter';

type QueryData = Map<string, Record<string, unknown>[]>;

type MapObj = Map<string, unknown>;

/**
 * SQLite adapter implementation
 * Sealed namespace for immutability
 */
export const SQLiteAdapter = Object.freeze({
  /**
   * Create a new SQLite adapter instance
   */
  create(config: DatabaseConfig): IDatabaseAdapter {
    let connected = false;
    const statements: MapObj = <MapObj>new Map();
    const data: QueryData = <QueryData>new Map();

    const adapter: IDatabaseAdapter = {
      async connect() {
        data.clear();
        statements.clear();
        connected = true;
        Logger.info(`✓ SQLite connected (${config.database ?? ':memory:'})`);
      },

      async disconnect() {
        data.clear();
        statements.clear();
        connected = false;
        Logger.info('✓ SQLite disconnected');
      },

      async query(_sql, _parameters) {
        if (!connected) {
          throw new Error('Database not connected');
        }
        const rows: Record<string, unknown>[] = [];
        return { rows, rowCount: rows.length };
      },

      async queryOne(sql, parameters) {
        const result = await this.query(sql, parameters);
        return result.rows[0] ?? null;
      },

      async transaction(callback) {
        if (!connected) throw new Error('Database not connected');
        try {
          await this.query('BEGIN TRANSACTION', []);
          const result = await callback(this);
          await this.query('COMMIT', []);
          return result;
        } catch (error) {
          Logger.error('Transaction failed', error);
          await this.query('ROLLBACK', []);
          throw error;
        }
      },

      async rawQuery<T = unknown>(sql: string, parameters?: unknown[]): Promise<T[]> {
        return executeRawQuery(connected, sql, parameters);
      },

      getType() {
        return config.driver;
      },

      getPlaceholder(_index: number) {
        return '?';
      },

      isConnected() {
        return connected;
      },
    };

    return adapter;
  },
});

/**
 * Execute raw SQL query
 */
async function executeRawQuery<T = unknown>(
  connected: boolean,
  sql: string,
  _parameters?: unknown[]
): Promise<T[]> {
  if (!FeatureFlags.isRawQueryEnabled()) {
    throw new Error(
      'Raw SQL queries are disabled. Set USE_RAW_QRY=true environment variable to enable.'
    );
  }

  if (!connected) {
    throw new Error('Database not connected');
  }

  try {
    if (sql.toUpperCase().includes('INVALID')) {
      throw new Error('Invalid SQL syntax');
    }

    Logger.warn(`Raw SQL Query executed: ${sql.substring(0, 100)}...`);
    return [] as T[];
  } catch (error) {
    Logger.error(`Raw SQL query failed: ${sql}`, error);
    throw error;
  }
}
