/**
 * Database Manager
 * Central database connection management and query execution
 */

import { OpenTelemetry } from '@/observability/OpenTelemetry';
import { Env } from '@config/env';
import { ErrorFactory } from '@exceptions/ZintrustError';
import { EventEmitter } from '@node-singletons/events';
import { D1Adapter } from '@orm/adapters/D1Adapter';
import { D1RemoteAdapter } from '@orm/adapters/D1RemoteAdapter';
import { MySQLAdapter } from '@orm/adapters/MySQLAdapter';
import { PostgreSQLAdapter } from '@orm/adapters/PostgreSQLAdapter';
import { SQLiteAdapter } from '@orm/adapters/SQLiteAdapter';
import { SQLServerAdapter } from '@orm/adapters/SQLServerAdapter';
import { DatabaseConfig, IDatabaseAdapter } from '@orm/DatabaseAdapter';
import { DatabaseAdapterRegistry } from '@orm/DatabaseAdapterRegistry';
import { IQueryBuilder, QueryBuilder } from '@orm/QueryBuilder';

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
  dispose(): void;
}

/**
 * Database Manager
 * Refactored to Functional Object pattern
 */
/**
 * Create appropriate adapter based on driver
 */
const createAdapter = (cfg: DatabaseConfig): IDatabaseAdapter => {
  const registered = DatabaseAdapterRegistry.get(cfg.driver);
  if (registered !== undefined) {
    return registered(cfg);
  }

  switch (cfg.driver) {
    case 'postgresql':
      return PostgreSQLAdapter.create(cfg);
    case 'mysql':
      return MySQLAdapter.create(cfg);
    case 'sqlserver':
      return SQLServerAdapter.create(cfg);
    case 'd1':
      return D1Adapter.create(cfg);
    case 'd1-remote':
      return D1RemoteAdapter.create(cfg);
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

const installDbMetricsIfEnabled = (
  dbConfig: DatabaseConfig,
  eventEmitter: EventEmitter
): (() => void) | null => {
  if (Env.getBool('METRICS_ENABLED', false) === false) return null;

  let observeDbQueryPromise: Promise<
    ((input: { driver: string; durationMs: number }) => Promise<void>) | null
  > | null = null;

  const ensureObserveDbQuery = async (): Promise<
    ((input: { driver: string; durationMs: number }) => Promise<void>) | null
  > => {
    if (observeDbQueryPromise !== null) return observeDbQueryPromise;

    observeDbQueryPromise = import('@/observability/PrometheusMetrics')
      .then((m) => m.PrometheusMetrics.observeDbQuery)
      .catch(() => null);

    return observeDbQueryPromise;
  };

  const handler = (_sql: string, _params: unknown[], durationMs: number): void => {
    void ensureObserveDbQuery().then((observe) => {
      if (observe === null) return;
      void observe({ driver: dbConfig.driver, durationMs });
    });
  };

  eventEmitter.on('after-query', handler);

  // Return cleanup function
  return (): void => {
    eventEmitter.off('after-query', handler);
  };
};

const installDbTracingIfEnabled = (
  dbConfig: DatabaseConfig,
  eventEmitter: EventEmitter
): (() => void) | null => {
  if (Env.getBool('OTEL_ENABLED', false) === false) return null;

  const handler = (_sql: string, _params: unknown[], durationMs: number): void => {
    OpenTelemetry.recordDbQuerySpan({ driver: dbConfig.driver, durationMs });
  };

  eventEmitter.on('after-query', handler);

  // Return cleanup function
  return (): void => {
    eventEmitter.off('after-query', handler);
  };
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

    // Store cleanup functions for event listeners
    const cleanupFunctions: Array<() => void> = [];

    // Install metrics and tracing, capture cleanup functions
    const metricsCleanup = installDbMetricsIfEnabled(dbConfig, eventEmitter);
    const tracingCleanup = installDbTracingIfEnabled(dbConfig, eventEmitter);

    if (metricsCleanup) cleanupFunctions.push(metricsCleanup);
    if (tracingCleanup) cleanupFunctions.push(tracingCleanup);

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
      dispose() {
        // Clean up event listeners to prevent memory leaks
        for (const cleanup of cleanupFunctions) {
          cleanup();
        }
        cleanupFunctions.length = 0;
      },
    };
    return db;
  },
});

const databaseInstances: Map<string, IDatabase> = new Map();

export const useEnsureDbConnected = async (
  config = undefined,
  connectionName = 'default'
): Promise<ReturnType<typeof useDatabase>> => {
  const db = useDatabase(config, connectionName);
  if (db.isConnected() === false) {
    await db.connect();
  }
  return db;
};

export function useDatabase(config?: DatabaseConfig, connection = 'default'): IDatabase {
  if (databaseInstances.has(connection) === false) {
    if (config === undefined) {
      throw ErrorFactory.createConfigError(
        `Database connection '${connection}' is not registered. ` +
          `Call useDatabase(config, '${connection}') during startup to register it.`
      );
    }

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
