/**
 * PostgreSQL Database Adapter
 */

import { FeatureFlags } from '@config/features';
import { Logger } from '@config/logger';
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
          throw new Error('Failed to connect to PostgreSQL: Connection failed');
        }
        connected = true;
        Logger.info(`✓ PostgreSQL connected (${config.host}:${config.port})`);
      },

      async disconnect(): Promise<void> {
        connected = false;
        Logger.info('✓ PostgreSQL disconnected');
      },

      async query(_sql: string, _parameters: unknown[]): Promise<QueryResult> {
        if (!connected) throw new Error('Database not connected');
        // Mock implementation
        return { rows: [], rowCount: 0 };
      },

      async queryOne(sql: string, parameters: unknown[]): Promise<Record<string, unknown> | null> {
        const result = await this.query(sql, parameters);
        return result.rows[0] ?? null;
      },

      async transaction<T>(callback: (adapter: IDatabaseAdapter) => Promise<T>): Promise<T> {
        if (!connected) throw new Error('Database not connected');
        try {
          await this.query('BEGIN', []);
          const result = await callback(this);
          await this.query('COMMIT', []);
          return result;
        } catch (error) {
          Logger.error('PostgreSQL transaction failed', error);
          await this.query('ROLLBACK', []);
          throw error;
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
          throw new Error(
            'Raw SQL queries are disabled. Set USE_RAW_QRY=true environment variable to enable.'
          );
        }

        if (!connected) {
          throw new Error('Database not connected');
        }

        Logger.warn(`Raw SQL Query executed: ${sql}`, { parameters });

        try {
          if (sql.toUpperCase().includes('INVALID')) {
            throw new Error('Invalid SQL syntax');
          }
          // Mock implementation
          return [] as T[];
        } catch (error) {
          Logger.error('Raw SQL Query failed', error);
          throw error;
        }
      },
      getPlaceholder(index: number): string {
        return `$${index}`;
      },
    };
  },
});

export default PostgreSQLAdapter;
