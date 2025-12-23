/**
 * Cloudflare D1 Database Adapter
 */

import { FeatureFlags } from '@config/features';
import { Logger } from '@config/logger';
import { DatabaseConfig, ID1Database, IDatabaseAdapter, QueryResult } from '@orm/DatabaseAdapter';

/**
 * Get D1 binding from config or global environment
 */
function getD1Binding(_config: DatabaseConfig): ID1Database | null {
  // 1. Check config
  if (_config.d1 !== undefined && _config.d1 !== null) return _config.d1;

  // 2. Check global env (Cloudflare Workers)
  const globalEnv = (globalThis as unknown as { env?: { DB?: ID1Database } }).env;
  if (globalEnv?.DB !== undefined) return globalEnv.DB;

  // 3. Check global scope
  const globalDB = (globalThis as unknown as { DB?: ID1Database }).DB;
  if (globalDB !== undefined) return globalDB;

  return null;
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
      async connect(): Promise<void> {
        connected = true;
        Logger.info('✓ D1 connected');
      },

      async disconnect(): Promise<void> {
        connected = false;
        Logger.info('✓ D1 disconnected');
      },

      async query(sql: string, parameters: unknown[]): Promise<QueryResult> {
        if (!connected) throw new Error('Database not connected');

        const db = getD1Binding(_config);
        if (db === null) {
          throw new Error('D1 database binding not found');
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
          Logger.error(`D1 query failed: ${sql}`, error);
          throw error;
        }
      },

      async queryOne(sql: string, parameters: unknown[]): Promise<Record<string, unknown> | null> {
        if (!connected) throw new Error('Database not connected');

        const db = getD1Binding(_config);
        if (db === null) {
          throw new Error('D1 database binding not found');
        }

        try {
          const stmt = db.prepare(sql);
          const result = await stmt.bind(...parameters).first<Record<string, unknown>>();
          return result || null;
        } catch (error) {
          Logger.error(`D1 queryOne failed: ${sql}`, error);
          throw error;
        }
      },

      async transaction<T>(callback: (adapter: IDatabaseAdapter) => Promise<T>): Promise<T> {
        if (!connected) throw new Error('Database not connected');
        try {
          const result = await callback(this);
          return result;
        } catch (error) {
          Logger.error('Transaction failed', error);
          throw error;
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
          throw new Error('Raw SQL queries are disabled');
        }

        if (!connected) {
          throw new Error('Database not connected');
        }

        const db = getD1Binding(_config);
        if (db === null) {
          throw new Error('D1 database binding not found');
        }

        try {
          Logger.warn(`Raw SQL Query executed: ${sql}`, { parameters });
          const stmt = db.prepare(sql);
          const result = await stmt.bind(...(parameters ?? [])).all<T>();
          return (result.results as T[]) ?? [];
        } catch (error) {
          Logger.error(`Raw SQL query failed: ${sql}`, error);
          throw error;
        }
      },
      getPlaceholder(_index: number): string {
        return '?';
      },
    };
  },
});

export default D1Adapter;
