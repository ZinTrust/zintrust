// TEMPLATE_START
/* eslint-disable @typescript-eslint/require-await */
/**
 * MySQL Database Adapter
 */

import { FeatureFlags } from '@config/features';
import { Logger } from '@config/logger';
import { ErrorFactory } from '@exceptions/ZintrustError';
import { DatabaseConfig, IDatabaseAdapter, QueryResult } from '@orm/DatabaseAdapter';

/**
 * MySQL adapter implementation
 * Sealed namespace for immutability
 */
export const MySQLAdapter = Object.freeze({
  /**
   * Create a new MySQL adapter instance
   */
  create(config: DatabaseConfig): IDatabaseAdapter {
    let connected = false;

    return {
      async connect(): Promise<void> {
        if (config.host === 'error') {
          throw ErrorFactory.createConnectionError(
            'Failed to connect to MySQL: Error: Connection failed'
          );
        }
        connected = true;
        Logger.info(`✓ MySQL connected (${config.host}:${config.port})`);
      },

      async disconnect(): Promise<void> {
        connected = false;
        Logger.info('✓ MySQL disconnected');
      },

      async query(_sql: string, _parameters: unknown[]): Promise<QueryResult> {
        if (!connected) throw ErrorFactory.createConnectionError('Database not connected');
        // Mock implementation
        return { rows: [], rowCount: 0 };
      },

      async queryOne(sql: string, parameters: unknown[]): Promise<Record<string, unknown> | null> {
        const result = await this.query(sql, parameters);
        return result.rows[0] ?? null;
      },

      async transaction<T>(callback: (adapter: IDatabaseAdapter) => Promise<T>): Promise<T> {
        if (!connected) throw ErrorFactory.createConnectionError('Database not connected');
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
        return connected;
      },
      async rawQuery<T = unknown>(sql: string, parameters?: unknown[]): Promise<T[]> {
        if (!FeatureFlags.isRawQueryEnabled()) {
          throw ErrorFactory.createConfigError('Raw SQL queries are disabled');
        }

        if (!connected) {
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
      },
      getPlaceholder(_index: number): string {
        return '?';
      },
    };
  },
});

export default MySQLAdapter;
// TEMPLATE_END
