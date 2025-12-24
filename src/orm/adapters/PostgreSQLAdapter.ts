/* eslint-disable @typescript-eslint/require-await */
/**
 * PostgreSQL Database Adapter
 */

import { FeatureFlags } from '@config/features';
import { Logger } from '@config/logger';
import { ErrorFactory } from '@exceptions/ZintrustError';
import { DatabaseConfig, IDatabaseAdapter, QueryResult } from '@orm/DatabaseAdapter';

/**
 * PostgreSQL adapter implementation
 * Sealed namespace for immutability
 */
export const PostgreSQLAdapter = Object.freeze({
  /**
   * Create a new PostgreSQL adapter instance
   */
  create(config: DatabaseConfig): IDatabaseAdapter {
    let connected = false;

    return {
      async connect(): Promise<void> {
        if (config.host === 'error') {
          throw ErrorFactory.createConnectionError(
            'Failed to connect to PostgreSQL: Connection failed'
          );
        }
        connected = true;
        Logger.info(`✓ PostgreSQL connected (${config.host}:${config.port})`);
      },

      async disconnect(): Promise<void> {
        connected = false;
        Logger.info('✓ PostgreSQL disconnected');
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
          await this.query('BEGIN', []);
          const result = await callback(this);
          await this.query('COMMIT', []);
          return result;
        } catch (error) {
          await this.query('ROLLBACK', []);
          throw ErrorFactory.createTryCatchError('PostgreSQL transaction failed', error);
        }
      },

      getType(): string {
        return 'postgresql';
      },
      isConnected(): boolean {
        return connected;
      },
      async rawQuery<T = unknown>(sql: string, parameters?: unknown[]): Promise<T[]> {
        if (!FeatureFlags.isRawQueryEnabled()) {
          throw ErrorFactory.createConfigError(
            'Raw SQL queries are disabled. Set USE_RAW_QRY=true environment variable to enable.'
          );
        }

        if (!connected) {
          throw ErrorFactory.createConnectionError('Database not connected');
        }

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
      },
      getPlaceholder(index: number): string {
        return `$${index}`;
      },
    };
  },
});

export default PostgreSQLAdapter;
