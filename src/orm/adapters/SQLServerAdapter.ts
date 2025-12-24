// TEMPLATE_START
/* eslint-disable @typescript-eslint/require-await */
/**
 * SQL Server Database Adapter
 */

import { FeatureFlags } from '@config/features';
import { Logger } from '@config/logger';
import { ErrorFactory } from '@exceptions/ZintrustError';
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
          throw ErrorFactory.createConnectionError(
            'Failed to connect to SQL Server: Error: Connection failed'
          );
        }
        connected = true;
        Logger.info(`✓ SQL Server connected (${config.host}:${config.port})`);
      },

      async disconnect(): Promise<void> {
        connected = false;
        Logger.info('✓ SQL Server disconnected');
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
        try {
          return await callback(this);
        } catch (error) {
          throw ErrorFactory.createTryCatchError('Transaction failed', error);
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
        return `@param${index}`;
      },
    };
  },
});

export default SQLServerAdapter;
// TEMPLATE_END
