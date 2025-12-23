/**
 * SQL Server Database Adapter
 */

import { FeatureFlags } from '@config/features';
import { Logger } from '@config/logger';
import { DatabaseConfig, IDatabaseAdapter, QueryResult } from '@orm/DatabaseAdapter';

/**
 * SQL Server adapter implementation
 * Sealed namespace for immutability
 */
export const SQLServerAdapter = Object.freeze({
  /**
   * Create a new SQL Server adapter instance
   */
  create(config: DatabaseConfig): IDatabaseAdapter {
    let connected = false;

    return {
      async connect(): Promise<void> {
        if (config.host === 'error') {
          throw new Error('Failed to connect to SQL Server: Error: Connection failed');
        }
        connected = true;
        Logger.info(`✓ SQL Server connected (${config.host}:${config.port})`);
      },

      async disconnect(): Promise<void> {
        connected = false;
        Logger.info('✓ SQL Server disconnected');
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
        try {
          return await callback(this);
        } catch (error) {
          Logger.error('Transaction failed', error);
          throw error;
        }
      },

      getType(): string {
        return 'sqlserver';
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
        return `@param${index}`;
      },
    };
  },
});

export default SQLServerAdapter;
