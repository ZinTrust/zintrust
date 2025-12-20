/**
 * Cloudflare D1 Database Adapter
 * Interfaces with the native D1 binding in Cloudflare Workers
 */

import { Logger } from '@config/logger';
import { BaseAdapter, DatabaseAdapter, DatabaseConfig, QueryResult } from '@orm/DatabaseAdapter';

export class D1Adapter extends BaseAdapter {
  private readonly db: any;

  constructor(config: DatabaseConfig) {
    super(config);
    // In Cloudflare Workers, the D1 database is usually bound to a variable in the environment
    // We expect it to be passed in the config or available globally
    this.db = (globalThis as any).env?.DB;
  }

  public async connect(): Promise<void> {
    if (!this.db) {
      Logger.warn(
        'D1 database binding "DB" not found in environment. Ensure it is configured in wrangler.jsonc'
      );
    }
    this.connected = true;
    Logger.info('✓ D1 Adapter initialized');
  }

  public async disconnect(): Promise<void> {
    this.connected = false;
    Logger.info('✓ D1 Adapter disconnected');
  }

  public async query(sql: string, parameters: unknown[]): Promise<QueryResult> {
    if (!this.db) {
      throw new Error('D1 database binding not found');
    }

    try {
      const stmt = this.db.prepare(sql).bind(...parameters);
      const { results } = await stmt.all();

      return {
        rows: results || [],
        rowCount: results?.length || 0,
      };
    } catch (error: any) {
      Logger.error(`D1 Query Error: ${error.message}`, { sql, parameters });
      throw error;
    }
  }

  public async queryOne(
    sql: string,
    parameters: unknown[]
  ): Promise<Record<string, unknown> | null> {
    if (!this.db) {
      throw new Error('D1 database binding not found');
    }

    try {
      const result = await this.db
        .prepare(sql)
        .bind(...parameters)
        .first();
      return result || null;
    } catch (error: any) {
      Logger.error(`D1 QueryOne Error: ${error.message}`, { sql, parameters });
      throw error;
    }
  }

  public async transaction<T>(callback: (adapter: DatabaseAdapter) => Promise<T>): Promise<T> {
    // D1 batching can be used for transactions
    // For now, we'll just execute the callback as D1 doesn't support traditional BEGIN/COMMIT via prepare
    return await callback(this);
  }

  protected getParameterPlaceholder(_index: number): string {
    return '?';
  }
}
