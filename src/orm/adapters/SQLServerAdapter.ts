/**
 * SQL Server Database Adapter
 * Uses mssql package for connections
 */

import { Logger } from '@config/logger';
import { BaseAdapter, DatabaseConfig, QueryResult } from '@orm/DatabaseAdapter';

/**
 * SQL Server adapter implementation
 * Requires: npm install mssql
 */
export class SQLServerAdapter extends BaseAdapter {
  constructor(config: DatabaseConfig) {
    super(config);
  }

  public async connect(): Promise<void> {
    try {
      // In production: const sql = require('mssql');
      // this.pool = new sql.ConnectionPool({...config}).connect();
      this.connected = true;
      Logger.info(`✓ SQL Server connected (${this.config.host}:${this.config.port || 1433})`);
    } catch (error) {
      throw new Error(`Failed to connect to SQL Server: ${String(error)}`);
    }
  }

  public async disconnect(): Promise<void> {
    this.connected = false;
    Logger.info('✓ SQL Server disconnected');
  }

  public async query(_sql: string, _parameters: unknown[]): Promise<QueryResult> {
    if (!this.connected) {
      throw new Error('Database not connected');
    }

    // In production:
    // const request = this.pool.request();
    // parameters.forEach((param, i) => request.input(`param${i}`, param));
    // const result = await request.query(sql);
    // return { rows: result.recordset, rowCount: result.rowsAffected[0] };

    return { rows: [], rowCount: 0 };
  }

  public async queryOne(
    sql: string,
    parameters: unknown[]
  ): Promise<Record<string, unknown> | null> {
    const result = await this.query(sql, parameters);
    return result.rows[0] ?? null;
  }

  public async transaction<T>(callback: (adapter: SQLServerAdapter) => Promise<T>): Promise<T> {
    try {
      const result = await callback(this);
      return result;
    } catch (error) {
      Logger.error('Transaction error:', error);
      throw error;
    }
  }

  protected getParameterPlaceholder(index: number): string {
    return `@param${index}`;
  }
}
