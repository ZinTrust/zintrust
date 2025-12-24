/**
 * Database Manager
 * Central database connection management and query execution
 */

import { ErrorFactory } from '@exceptions/ZintrustError';
import { D1Adapter } from '@orm/adapters/D1Adapter';
import { MySQLAdapter } from '@orm/adapters/MySQLAdapter';
import { PostgreSQLAdapter } from '@orm/adapters/PostgreSQLAdapter';
import { SQLiteAdapter } from '@orm/adapters/SQLiteAdapter';
import { SQLServerAdapter } from '@orm/adapters/SQLServerAdapter';
import { DatabaseConfig, IDatabaseAdapter } from '@orm/DatabaseAdapter';
import { IQueryBuilder, QueryBuilder } from '@orm/QueryBuilder';
import { EventEmitter } from 'node:events';

export interface IDatabase {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  query(sql: string, parameters?: unknown[], isRead?: boolean): Promise<unknown[]>;
  queryOne(sql: string, parameters?: unknown[], isRead?: boolean): Promise<unknown>;
  transaction<T>(callback: (db: IDatabase) => Promise<T>): Promise<T>;
  table(name: string): IQueryBuilder;
  onBeforeQuery(handler: (query: string, params: unknown[]) => void): void;
  onAfterQuery(handler: (query: string, params: unknown[], duration: number) => void): void;
  offBeforeQuery(handler: (query: string, params: unknown[]) => void): void;
  offAfterQuery(handler: (query: string, params: unknown[], duration: number) => void): void;
  getAdapterInstance(isRead?: boolean): IDatabaseAdapter;
  getType(): string;
  getConfig(): DatabaseConfig;
}

/**
 * Database Manager
 * Refactored to Functional Object pattern
 */
/**
 * Create appropriate adapter based on driver
 */
const createAdapter = (cfg: DatabaseConfig): IDatabaseAdapter => {
  switch (cfg.driver) {
    case 'postgresql':
      return PostgreSQLAdapter.create(cfg);
    case 'mysql':
      return MySQLAdapter.create(cfg);
    case 'sqlserver':
      return SQLServerAdapter.create(cfg);
    case 'd1':
      return D1Adapter.create(cfg);
    case 'sqlite':
    default:
      return SQLiteAdapter.create(cfg);
  }
};

/**
 * Initialize write and read adapters
 */
const initializeAdapters = (
  dbConfig: DatabaseConfig
): { writeAdapter: IDatabaseAdapter; readAdapters: IDatabaseAdapter[] } => {
  const writeAdapter = createAdapter(dbConfig);
  const readAdapters: IDatabaseAdapter[] = [];

  if (dbConfig.readHosts !== undefined && dbConfig.readHosts.length > 0) {
    for (const host of dbConfig.readHosts) {
      readAdapters.push(createAdapter({ ...dbConfig, host }));
    }
  } else {
    readAdapters.push(writeAdapter);
  }

  return { writeAdapter, readAdapters };
};

/**
 * Execute a query with events and timing
 */
const executeQuery = async (
  adapter: IDatabaseAdapter,
  eventEmitter: EventEmitter,
  sql: string,
  parameters: unknown[],
  method: 'query'
): Promise<unknown[]> => {
  eventEmitter.emit('before-query', sql, parameters);
  const startTime = Date.now();
  const result = await adapter[method](sql, parameters);
  const duration = Date.now() - startTime;
  eventEmitter.emit('after-query', sql, parameters, duration);
  return (result as { rows: unknown[] }).rows;
};

const executeQueryOne = async (
  adapter: IDatabaseAdapter,
  eventEmitter: EventEmitter,
  sql: string,
  parameters: unknown[]
): Promise<unknown> => {
  eventEmitter.emit('before-query', sql, parameters);
  const startTime = Date.now();
  const result = await adapter.queryOne(sql, parameters);
  const duration = Date.now() - startTime;
  eventEmitter.emit('after-query', sql, parameters, duration);
  return result;
};

export const Database = Object.freeze({
  /**
   * Create a new database instance
   */
  create(config?: DatabaseConfig): IDatabase {
    const dbConfig = config ?? { driver: 'sqlite', database: ':memory:' };
    const eventEmitter = new EventEmitter();
    let connected = false;
    let readIndex = 0;

    const { writeAdapter, readAdapters } = initializeAdapters(dbConfig);

    const getAdapter = (isRead = false): IDatabaseAdapter => {
      if (isRead === false || readAdapters.length === 0) {
        return writeAdapter;
      }
      const adapter = readAdapters[readIndex];
      if (adapter === undefined) return writeAdapter;
      readIndex = (readIndex + 1) % readAdapters.length;
      return adapter;
    };

    const db: IDatabase = {
      async connect() {
        await writeAdapter.connect();
        await Promise.all(
          readAdapters
            .filter((adapter) => adapter !== writeAdapter)
            .map(async (adapter) => adapter.connect())
        );
        connected = true;
      },
      async disconnect() {
        await writeAdapter.disconnect();
        await Promise.all(
          readAdapters
            .filter((adapter) => adapter !== writeAdapter)
            .map(async (adapter) => adapter.disconnect())
        );
        connected = false;
      },
      isConnected() {
        return connected;
      },
      async query(sql, parameters = [], isRead = false) {
        if (connected === false)
          throw ErrorFactory.createConnectionError('Database not connected. Call connect() first.');
        return executeQuery(getAdapter(isRead), eventEmitter, sql, parameters, 'query');
      },
      async queryOne(sql, parameters = [], isRead = false) {
        if (connected === false)
          throw ErrorFactory.createConnectionError('Database not connected. Call connect() first.');
        return executeQueryOne(getAdapter(isRead), eventEmitter, sql, parameters);
      },
      async transaction<T>(callback: (db: IDatabase) => Promise<T>) {
        return writeAdapter.transaction(async () => callback(db));
      },
      table(name) {
        return QueryBuilder.create(name, db);
      },
      onBeforeQuery: (h) => eventEmitter.on('before-query', h),
      onAfterQuery: (h) => eventEmitter.on('after-query', h),
      offBeforeQuery: (h) => eventEmitter.off('before-query', h),
      offAfterQuery: (h) => eventEmitter.off('after-query', h),
      getAdapterInstance(isRead = false) {
        return getAdapter(isRead);
      },
      getType() {
        return writeAdapter.getType();
      },
      getConfig() {
        return { ...dbConfig };
      },
    };
    return db;
  },
});

const databaseInstances: Map<string, IDatabase> = new Map();

export function useDatabase(config?: DatabaseConfig, connection = 'default'): IDatabase {
  if (databaseInstances.has(connection) === false) {
    databaseInstances.set(connection, Database.create(config));
  }
  const instance = databaseInstances.get(connection);
  if (instance === undefined) {
    throw ErrorFactory.createConfigError(`Failed to initialize database instance: ${connection}`);
  }
  return instance;
}

export async function resetDatabase(): Promise<void> {
  const promises = Array.from(databaseInstances.values()).map(async (instance) => {
    try {
      await instance.disconnect();
    } catch {
      // Ignore errors during disconnect
    }
  });
  await Promise.all(promises);
  databaseInstances.clear();
}
