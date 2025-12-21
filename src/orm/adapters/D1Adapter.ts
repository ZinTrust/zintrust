/**
 * Cloudflare D1 Database Adapter
 * Interfaces with the native D1 binding in Cloudflare Workers
 */

import { Logger } from '@config/logger';
import { BaseAdapter, DatabaseAdapter, DatabaseConfig, QueryResult } from '@orm/DatabaseAdapter';

interface D1Database {
  prepare: (sql: string) => D1Statement;
}

interface D1Statement {
  bind: (...params: unknown[]) => D1StatementBound;
}

interface D1StatementBound {
  all: () => Promise<{ results: Record<string, unknown>[] }>;
  first: () => Promise<Record<string, unknown> | null>;
}

export class D1Adapter extends BaseAdapter {
  private readonly db: D1Database | undefined;

  constructor(config: DatabaseConfig) {
    super(config);
    // In Cloudflare Workers, the D1 database is usually bound to a variable in the environment
    // We expect it to be passed in the config or available globally
    this.db = (globalThis as unknown as { env?: { DB?: D1Database } }).env?.DB;
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
    } catch (error) {
      Logger.error(`D1 Query Error: ${error instanceof Error ? error.message : String(error)}`, {
        sql,
        parameters,
      });
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
    } catch (error) {
      Logger.error(`D1 QueryOne Error: ${error instanceof Error ? error.message : String(error)}`, {
        sql,
        parameters,
      });
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
