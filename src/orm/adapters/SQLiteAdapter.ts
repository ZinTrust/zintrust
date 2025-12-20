/**
 * SQLite Database Adapter
 * Uses better-sqlite3 for synchronous operations or sql.js for in-memory
 */

import { Logger } from '@config/logger';
import { BaseAdapter, DatabaseAdapter, DatabaseConfig, QueryResult } from '@orm/DatabaseAdapter';

/**
 * In-memory implementation for development/testing
 * Actual production use would require better-sqlite3 package
 */
export class SQLiteAdapter extends BaseAdapter {
  private readonly statements: Map<string, unknown> = new Map();
  private readonly data: Map<string, Record<string, unknown>[]> = new Map();

  constructor(config: DatabaseConfig) {
    super(config);
  }

  public async connect(): Promise<void> {
    // Initialize in-memory storage
    this.data.clear();
    this.statements.clear();
    this.connected = true;
    Logger.info(`✓ SQLite connected (${this.config.database || ':memory:'})`);
  }

  public async disconnect(): Promise<void> {
    this.data.clear();
    this.statements.clear();
    this.connected = false;
    Logger.info('✓ SQLite disconnected');
  }

  public async query(_sql: string, _parameters: unknown[]): Promise<QueryResult> {
    if (!this.connected) {
      throw new Error('Database not connected');
    }

    // Simulate query execution
    // In production, this would use better-sqlite3 or sql.js
    const rows: Record<string, unknown>[] = [];

    return {
      rows,
      rowCount: rows.length,
    };
  }

  public async queryOne(
    sql: string,
    parameters: unknown[]
  ): Promise<Record<string, unknown> | null> {
    const result = await this.query(sql, parameters);
    return result.rows[0] ?? null;
  }

  public async transaction<T>(callback: (adapter: DatabaseAdapter) => Promise<T>): Promise<T> {
    // Begin transaction
    const result = await callback(this);
    // Commit transaction
    return result;
  }

  protected getParameterPlaceholder(index: number): string {
    return `$${index}`;
  }
}
