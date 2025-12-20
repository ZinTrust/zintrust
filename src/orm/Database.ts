/**
 * Database Manager
 * Central database connection management and query execution
 */

import { D1Adapter } from '@orm/adapters/D1Adapter';
import { MySQLAdapter } from '@orm/adapters/MySQLAdapter';
import { PostgreSQLAdapter } from '@orm/adapters/PostgreSQLAdapter';
import { SQLiteAdapter } from '@orm/adapters/SQLiteAdapter';
import { SQLServerAdapter } from '@orm/adapters/SQLServerAdapter';
import { DatabaseAdapter, DatabaseConfig } from '@orm/DatabaseAdapter';
import { QueryBuilder } from '@orm/QueryBuilder';
import { EventEmitter } from 'node:events';

export class Database {
  private readonly writeAdapter: DatabaseAdapter;
  private readonly readAdapters: DatabaseAdapter[] = [];
  private readonly config: DatabaseConfig;
  private connected = false;
  private readonly eventEmitter = new EventEmitter();
  private readIndex = 0;

  constructor(config: DatabaseConfig | undefined) {
    this.config = config ?? { driver: 'sqlite', database: ':memory:' };
    this.writeAdapter = this.createAdapter(this.config);

    // Initialize read adapters if readHosts are provided
    if (this.config.readHosts !== undefined && this.config.readHosts.length > 0) {
      for (const host of this.config.readHosts) {
        this.readAdapters.push(this.createAdapter({ ...this.config, host }));
      }
    } else {
      // Fallback to write adapter for reads
      this.readAdapters.push(this.writeAdapter);
    }
  }

  /**
   * Create appropriate adapter based on driver
   */
  private createAdapter(config: DatabaseConfig): DatabaseAdapter {
    switch (config.driver) {
      case 'postgresql':
        return new PostgreSQLAdapter(config);
      case 'mysql':
        return new MySQLAdapter(config);
      case 'sqlserver':
        return new SQLServerAdapter(config);
      case 'd1':
        return new D1Adapter(config);
      case 'sqlite':
      default:
        return new SQLiteAdapter(config);
    }
  }

  /**
   * Connect to database
   */
  public async connect(): Promise<void> {
    await this.writeAdapter.connect();
    for (const adapter of this.readAdapters) {
      if (adapter !== this.writeAdapter) {
        await adapter.connect();
      }
    }
    this.connected = true;
  }

  /**
   * Disconnect from database
   */
  public async disconnect(): Promise<void> {
    await this.writeAdapter.disconnect();
    for (const adapter of this.readAdapters) {
      if (adapter !== this.writeAdapter) {
        await adapter.disconnect();
      }
    }
    this.connected = false;
  }

  /**
   * Check if database is connected
   */
  public isConnected(): boolean {
    return this.connected;
  }

  /**
   * Get appropriate adapter for operation
   */
  private getAdapter(isRead = false): DatabaseAdapter {
    if (isRead === false || this.readAdapters.length === 0) {
      return this.writeAdapter;
    }

    // Round-robin selection for read adapters
    const adapter = this.readAdapters[this.readIndex];
    if (adapter === undefined) {
      return this.writeAdapter;
    }
    this.readIndex = (this.readIndex + 1) % this.readAdapters.length;
    return adapter;
  }

  /**
   * Execute a raw query
   */
  public async query(sql: string, parameters: unknown[] = [], isRead = false): Promise<unknown[]> {
    if (this.connected === false) {
      throw new Error('Database not connected. Call connect() first.');
    }

    const adapter = this.getAdapter(isRead);

    // Emit before query event
    this.eventEmitter.emit('before-query', sql, parameters);

    // Measure query duration
    const startTime = Date.now();
    const result = await adapter.query(sql, parameters);
    const duration = Date.now() - startTime;

    // Emit after query event with timing
    this.eventEmitter.emit('after-query', sql, parameters, duration);

    return result.rows;
  }

  /**
   * Execute a query and return first result
   */
  public async queryOne(sql: string, parameters: unknown[] = [], isRead = false): Promise<unknown> {
    if (this.connected === false) {
      throw new Error('Database not connected. Call connect() first.');
    }

    const adapter = this.getAdapter(isRead);

    // Emit before query event
    this.eventEmitter.emit('before-query', sql, parameters);

    // Measure query duration
    const startTime = Date.now();
    const result = await adapter.queryOne(sql, parameters);
    const duration = Date.now() - startTime;

    // Emit after query event with timing
    this.eventEmitter.emit('after-query', sql, parameters, duration);

    return result;
  }

  /**
   * Execute queries in a transaction
   */
  public async transaction<T>(callback: (db: Database) => Promise<T>): Promise<T> {
    return this.writeAdapter.transaction(async (_adapter) => {
      // Pass this instance to callback
      return callback(this);
    });
  }

  /**
   * Create a query builder
   */
  public table(name: string): QueryBuilder {
    return new QueryBuilder(name);
  }

  /**
   * Register handler for before query event
   */
  public onBeforeQuery(handler: (query: string, params: unknown[]) => void): void {
    this.eventEmitter.on('before-query', handler);
  }

  /**
   * Register handler for after query event
   */
  public onAfterQuery(handler: (query: string, params: unknown[], duration: number) => void): void {
    this.eventEmitter.on('after-query', handler);
  }

  /**
   * Remove before query handler
   */
  public offBeforeQuery(handler: (query: string, params: unknown[]) => void): void {
    this.eventEmitter.off('before-query', handler);
  }

  /**
   * Remove after query handler
   */
  public offAfterQuery(
    handler: (query: string, params: unknown[], duration: number) => void
  ): void {
    this.eventEmitter.off('after-query', handler);
  }

  /**
   * Get the underlying adapter
   */
  public getAdapterInstance(isRead = false): DatabaseAdapter {
    return this.getAdapter(isRead);
  }

  /**
   * Get database type
   */
  public getType(): string {
    return this.writeAdapter.getType();
  }

  /**
   * Get raw configuration
   */
  public getConfig(): DatabaseConfig {
    return { ...this.config };
  }
}

// Singleton instances registry
const databaseInstances: Map<string, Database> = new Map();

/**
 * Get or create database instance
 */
export function useDatabase(config?: DatabaseConfig, connection = 'default'): Database {
  if (databaseInstances.has(connection) === false) {
    databaseInstances.set(connection, new Database(config));
  }

  const instance = databaseInstances.get(connection);
  if (instance === undefined) {
    throw new Error(`Failed to initialize database instance: ${connection}`);
  }

  return instance;
}

/**
 * Reset database instances (useful for testing)
 */
export function resetDatabase(): void {
  databaseInstances.clear();
}
