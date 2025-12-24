/**
 * SQLite Database Adapter
 * Production Implementation
 */

import { Logger } from '@config/logger';
import { FeatureFlags } from '@config/features';
import { ErrorFactory } from '@exceptions/ZintrustError';
import { DatabaseConfig, IDatabaseAdapter, QueryResult } from '@orm/DatabaseAdapter';
import Database from 'better-sqlite3';

export const SQLiteAdapter = Object.freeze({
  create(config: DatabaseConfig): IDatabaseAdapter {
    let db: Database.Database | null = null;

    return {
      async connect(): Promise<void> {
        if (db) return;

        const filename = config.database || ':memory:';
        db = new Database(filename);

        // Enable WAL mode for better concurrency
        db.pragma('journal_mode = WAL');

        Logger.info(`✓ SQLite connected (${filename})`);
      },

      async disconnect(): Promise<void> {
        if (db) {
          db.close();
          db = null;
          Logger.info('✓ SQLite disconnected');
        }
      },

      async query(sql: string, parameters: unknown[] = []): Promise<QueryResult> {
        if (!db) throw ErrorFactory.createConnectionError('Database not connected');

        const start = performance.now();
        try {
          const stmt = db.prepare(sql);

          let result;
          if (sql.trim().toLowerCase().startsWith('select')) {
            result = stmt.all(parameters);
            return {
              rows: result as Record<string, unknown>[],
              rowCount: result.length,
              duration: performance.now() - start
            };
          } else {
            const info = stmt.run(parameters);
            return {
              rows: [],
              rowCount: info.changes,
              duration: performance.now() - start
            };
          }
        } catch (error) {
          Logger.error('Query failed', { sql, parameters, error });
          throw error;
        }
      },

      async queryOne(sql: string, parameters: unknown[] = []): Promise<Record<string, unknown> | null> {
        const result = await this.query(sql, parameters);
        return result.rows[0] ?? null;
      },

      async transaction<T>(callback: (adapter: IDatabaseAdapter) => Promise<T>): Promise<T> {
        if (!db) throw ErrorFactory.createConnectionError('Database not connected');

        // Simplified transaction support for now
        await this.query('BEGIN');
        try {
          const result = await callback(this);
          await this.query('COMMIT');
          return result;
        } catch (error) {
          await this.query('ROLLBACK');
          throw error;
        }
      },

      async rawQuery<T = unknown>(sql: string, parameters: unknown[] = []): Promise<T[]> {
        if (!FeatureFlags.isRawQueryEnabled()) {
          throw ErrorFactory.createConfigError('Raw SQL queries are disabled');
        }
        if (!db) throw ErrorFactory.createConnectionError('Database not connected');

        Logger.warn(`Raw SQL Query executed: ${sql}`);

        try {
          const stmt = db.prepare(sql);
          if (sql.trim().toLowerCase().startsWith('select')) {
            return stmt.all(parameters) as T[];
          } else {
            stmt.run(parameters);
            return [] as T[];
          }
        } catch (error) {
          Logger.error('Raw query failed', { sql, parameters, error });
          throw error;
        }
      },

      getType(): string {
        return 'sqlite';
      },

      isConnected(): boolean {
        return !!db;
      },

      getPlaceholder(index: number): string {
        return '?';
      }
    };
  }
});
