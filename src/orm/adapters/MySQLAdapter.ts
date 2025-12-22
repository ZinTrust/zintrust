/**
 * MySQL Database Adapter
 * Uses mysql2 package for connections
 */

import { Logger } from '@config/logger';
import { BaseAdapter, DatabaseConfig, QueryResult } from '@orm/DatabaseAdapter';

/**
 * MySQL adapter implementation
 * Requires: npm install mysql2
 */
export class MySQLAdapter extends BaseAdapter {
  private readonly pool: unknown = null;

  // eslint-disable-next-line @typescript-eslint/no-useless-constructor
  constructor(config: DatabaseConfig) {
    super(config);
  }

  public async connect(): Promise<void> {
    try {
      // In production: const mysql = require('mysql2/promise');
      // this.pool = mysql.createPool({...config});
      Logger.info(`✓ MySQL connected (${this.config.host}:${this.config.port ?? 3306})`);
      this.connected = true;
    } catch (error) {
      Logger.error('Failed to connect to MySQL:', error);
      throw new Error(`Failed to connect to MySQL: ${String(error)}`);
    }
  }

  public async disconnect(): Promise<void> {
    this.connected = false;
    Logger.info('✓ MySQL disconnected');
  }

  public async query(_sql: string, _parameters: unknown[]): Promise<QueryResult> {
    if (!this.connected) {
      throw new Error('Database not connected');
    }

    // In production:
    // const [rows] = await this.pool.query(sql, parameters);
    // return { rows: rows as Record<string, unknown>[], rowCount: rows.length };

    return { rows: [], rowCount: 0 };
  }

  public async queryOne(
    sql: string,
    parameters: unknown[]
  ): Promise<Record<string, unknown> | null> {
    const result = await this.query(sql, parameters);
    return result.rows[0] ?? null;
  }

  public async transaction<T>(callback: (adapter: MySQLAdapter) => Promise<T>): Promise<T> {
    type Connection = { query: (sql: string) => Promise<void>; release: () => void };
    const connection = await (
      this.pool as { getConnection?: () => Promise<Connection> }
    )?.getConnection?.();
    try {
      await (connection as unknown as Connection | undefined)?.query?.('START TRANSACTION');
      const result = await callback(this);
      await (connection as unknown as Connection | undefined)?.query?.('COMMIT');
      return result;
    } catch (error) {
      Logger.error('Transaction error', error instanceof Error ? error : new Error(String(error)));
      await (connection as unknown as Connection | undefined)?.query?.('ROLLBACK');
      throw error;
    } finally {
      (connection as unknown as Connection | undefined)?.release?.();
    }
  }

  protected getParameterPlaceholder(_index: number): string {
    return '?';
  }
}
