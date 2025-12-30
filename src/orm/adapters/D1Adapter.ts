/**
 * Cloudflare D1 Database Adapter
 */

import { Cloudflare } from '@config/cloudflare';
import { FeatureFlags } from '@config/features';
import { Logger } from '@config/logger';
import { ErrorFactory } from '@exceptions/ZintrustError';
import { DatabaseConfig, ID1Database, IDatabaseAdapter, QueryResult } from '@orm/DatabaseAdapter';

/**
 * Get D1 binding from config or global environment
 */
function getD1Binding(_config: DatabaseConfig): ID1Database | null {
  return Cloudflare.getD1Binding(_config);
}

/**
 * D1 adapter implementation
 */
export const D1Adapter = Object.freeze({
  /**
   * Create a new D1 adapter instance
   */
  // eslint-disable-next-line max-lines-per-function
  create(_config: DatabaseConfig): IDatabaseAdapter {
    let connected = false;

    return {
      // eslint-disable-next-line @typescript-eslint/require-await
      async connect(): Promise<void> {
        connected = true;
        Logger.info('✓ D1 connected');
      },

      // eslint-disable-next-line @typescript-eslint/require-await
      async disconnect(): Promise<void> {
        connected = false;
        Logger.info('✓ D1 disconnected');
      },

      async query(sql: string, parameters: unknown[]): Promise<QueryResult> {
        if (!connected) throw ErrorFactory.createConnectionError('Database not connected');

        const db = getD1Binding(_config);
        if (db === null) {
          throw ErrorFactory.createConfigError('D1 database binding not found');
        }

        try {
          const stmt = db.prepare(sql);
          const result = await stmt.bind(...parameters).all();
          const rows = (result.results as Record<string, unknown>[]) ?? [];
          return {
            rows,
            rowCount: rows.length,
          };
        } catch (error) {
          throw ErrorFactory.createTryCatchError(`D1 query failed: ${sql}`, error);
        }
      },

      async queryOne(sql: string, parameters: unknown[]): Promise<Record<string, unknown> | null> {
        if (!connected) throw ErrorFactory.createConnectionError('Database not connected');

        const db = getD1Binding(_config);
        if (db === null) {
          throw ErrorFactory.createConfigError('D1 database binding not found');
        }

        try {
          const stmt = db.prepare(sql);
          const result = await stmt.bind(...parameters).first<Record<string, unknown>>();
          return result ?? null;
        } catch (error) {
          throw ErrorFactory.createTryCatchError(`D1 queryOne failed: ${sql}`, error);
        }
      },

      async ping(): Promise<void> {
        if (!connected) throw ErrorFactory.createConnectionError('Database not connected');

        const db = getD1Binding(_config);
        if (db === null) {
          throw ErrorFactory.createConfigError('D1 database binding not found');
        }

        try {
          // Use a minimal, side-effect-free query.
          await db.prepare('SELECT 1').bind().first();
        } catch (error) {
          throw ErrorFactory.createTryCatchError('D1 ping failed', error);
        }
      },

      async transaction<T>(callback: (adapter: IDatabaseAdapter) => Promise<T>): Promise<T> {
        if (!connected) throw ErrorFactory.createConnectionError('Database not connected');
        try {
          const result = await callback(this);
          return result;
        } catch (error) {
          throw ErrorFactory.createTryCatchError('Transaction failed', error);
        }
      },

      getType(): string {
        return 'd1';
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

        const db = getD1Binding(_config);
        if (db === null) {
          throw ErrorFactory.createConfigError('D1 database binding not found');
        }

        try {
          Logger.warn(`Raw SQL Query executed: ${sql}`, { parameters });
          const stmt = db.prepare(sql);
          const result = await stmt.bind(...(parameters ?? [])).all<T>();
          return (result.results as T[]) ?? [];
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

export default D1Adapter;
