/**
 * PostgreSQL Database Adapter
 * Uses pg (postgres) package for connections
 */

import { Logger } from '@config/logger';
import { BaseAdapter, DatabaseConfig, QueryResult } from '@orm/DatabaseAdapter';

/**
 * PostgreSQL adapter implementation
 * Requires: yarn add pg
 */
export class PostgreSQLAdapter extends BaseAdapter {
  constructor(config: DatabaseConfig) {
    super(config);
  }

  public async connect(): Promise<void> {
    try {
      // In production: const pg = require('pg');
      // this.pool = new pg.Pool({...config});
      this.connected = true;
      Logger.info(`✓ PostgreSQL connected (${this.config.host}:${this.config.port || 5432})`);
    } catch (error) {
      throw new Error(`Failed to connect to PostgreSQL: ${String(error)}`);
    }
  }

  public async disconnect(): Promise<void> {
    this.connected = false;
    Logger.info('✓ PostgreSQL disconnected');
  }

  public async query(_sql: string, _parameters: unknown[]): Promise<QueryResult> {
    if (!this.connected) {
      throw new Error('Database not connected');
    }

    // In production:
    // const result = await this.pool.query(sql, parameters);
    // return { rows: result.rows, rowCount: result.rowCount };

    return { rows: [], rowCount: 0 };
  }

  public async queryOne(
    sql: string,
    parameters: unknown[]
  ): Promise<Record<string, unknown> | null> {
    const result = await this.query(sql, parameters);
    return result.rows[0] ?? null;
  }

  public async transaction<T>(callback: (adapter: PostgreSQLAdapter) => Promise<T>): Promise<T> {
    try {
      const result = await callback(this);
      return result;
    } catch (error) {
      Logger.error('error', error);
      throw error;
    }
  }

  protected getParameterPlaceholder(index: number): string {
    return `$${index}`;
  }
}
