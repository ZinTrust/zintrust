/**
 * Database Manager
 * Central database connection management and query execution
 */

import { OpenTelemetry } from '@/observability/OpenTelemetry';
import { Cloudflare } from '@config/cloudflare';
import { Env } from '@config/env';
import { ErrorFactory } from '@exceptions/ZintrustError';
import type { SupportedDriver } from '@migrations/enum';
import { EventEmitter } from '@node-singletons/events';
import { D1Adapter } from '@orm/adapters/D1Adapter';
import { D1RemoteAdapter } from '@orm/adapters/D1RemoteAdapter';
import { MySQLAdapter } from '@orm/adapters/MySQLAdapter';
import { MySQLProxyAdapter } from '@orm/adapters/MySQLProxyAdapter';
import { PostgreSQLAdapter } from '@orm/adapters/PostgreSQLAdapter';
import { PostgreSQLProxyAdapter } from '@orm/adapters/PostgreSQLProxyAdapter';
import { SQLiteAdapter } from '@orm/adapters/SQLiteAdapter';
import { SQLServerAdapter } from '@orm/adapters/SQLServerAdapter';
import type { DatabaseConfig, IDatabaseAdapter, QueryResult } from '@orm/DatabaseAdapter';
import { DatabaseAdapterRegistry } from '@orm/DatabaseAdapterRegistry';
import type { IQueryBuilder } from '@orm/QueryBuilder';
import { QueryBuilder } from '@orm/QueryBuilder';

export interface IDatabase {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  query(sql: string, parameters?: unknown[], isRead?: boolean): Promise<unknown[]>;
  queryOne(sql: string, parameters?: unknown[], isRead?: boolean): Promise<unknown>;
  execute(sql: string, parameters?: unknown[], isRead?: boolean): Promise<QueryResult>;
  transaction<T>(callback: (db: IDatabase) => Promise<T>): Promise<T>;
  table(name: string): IQueryBuilder;
  onBeforeQuery(handler: (query: string, params: unknown[]) => void): void;
  onAfterQuery(handler: (query: string, params: unknown[], duration: number) => void): void;
  offBeforeQuery(handler: (query: string, params: unknown[]) => void): void;
  offAfterQuery(handler: (query: string, params: unknown[], duration: number) => void): void;
  getAdapterInstance(isRead?: boolean): IDatabaseAdapter;
  getType(): SupportedDriver;
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
const resolveMySqlProxyAdapter = (cfg: DatabaseConfig): IDatabaseAdapter | null => {
  if (cfg.driver !== 'mysql') return null;
  const proxyUrl = Env.get('MYSQL_PROXY_URL', '').trim();
  const useProxy = Env.getBool('USE_MYSQL_PROXY', false);
  if (useProxy && proxyUrl.length > 0) {
    return MySQLProxyAdapter.create(cfg);
  }
  return null;
};

const resolvePostgresProxyAdapter = (cfg: DatabaseConfig): IDatabaseAdapter | null => {
  if (cfg.driver !== 'postgresql') return null;
  const proxyUrl = Env.get('POSTGRES_PROXY_URL', '').trim();
  const host = Env.get('POSTGRES_PROXY_HOST', '127.0.0.1').trim() || '127.0.0.1';
  const port = Env.get('POSTGRES_PROXY_PORT', '8790').trim() || '8790';
  const derivedUrl = proxyUrl === '' ? `http://${host}:${port}` : proxyUrl;
  const useProxy = Env.getBool('USE_POSTGRES_PROXY', false);
  if (useProxy && derivedUrl.length > 0) {
    return PostgreSQLProxyAdapter.create(cfg);
  }
  return null;
};

const ensureCloudflareSocketSupport = (cfg: DatabaseConfig): void => {
  const isSocketDriver = cfg.driver === 'postgresql' || cfg.driver === 'mysql';
  if (!isSocketDriver) return;
  if (Cloudflare.isCloudflareSocketsEnabled()) return;
  throw ErrorFactory.createConfigError(
    'Cloudflare sockets are disabled. Set ENABLE_CLOUDFLARE_SOCKETS=true to use SQL adapters on Workers.'
  );
};

const resolveWorkersAdapter = (cfg: DatabaseConfig): IDatabaseAdapter | null => {
  if (Cloudflare.getWorkersEnv() === null) return null;

  const mysqlProxy = resolveMySqlProxyAdapter(cfg);
  if (mysqlProxy) return mysqlProxy;

  const postgresProxy = resolvePostgresProxyAdapter(cfg);
  if (postgresProxy) return postgresProxy;

  ensureCloudflareSocketSupport(cfg);
  return null;
};

const createAdapter = (cfg: DatabaseConfig): IDatabaseAdapter => {
  const workersAdapter = resolveWorkersAdapter(cfg);
  if (workersAdapter) return workersAdapter;
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
  const readAdapters: IDatabaseAdapter[] = [writeAdapter];

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
  return result.rows;
};

const executeFullQuery = async (
  adapter: IDatabaseAdapter,
  eventEmitter: EventEmitter,
  sql: string,
  parameters: unknown[]
): Promise<QueryResult> => {
  eventEmitter.emit('before-query', sql, parameters);
  const startTime = Date.now();
  const result = await adapter.query(sql, parameters);
  const duration = Date.now() - startTime;
  eventEmitter.emit('after-query', sql, parameters, duration);
  return result;
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

/**
 * Create connect/disconnect handlers
 */
const createConnectionHandlers = (
  writeAdapter: IDatabaseAdapter,
  readAdapters: IDatabaseAdapter[],
  connected: { value: boolean },
  connectInFlight: { value: Promise<void> | undefined }
): {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
} => {
  return {
    async connect() {
      if (connected.value) return;

      const inFlight = connectInFlight.value;
      if (inFlight !== undefined) {
        await inFlight;
        return;
      }

      connectInFlight.value = (async () => {
        await writeAdapter.connect();
        await Promise.all(
          readAdapters
            .filter((adapter) => adapter !== writeAdapter)
            .map(async (adapter) => adapter.connect())
        );
        connected.value = true;
      })();

      try {
        await connectInFlight.value;
      } finally {
        connectInFlight.value = undefined;
      }
    },
    async disconnect() {
      if (connectInFlight.value !== undefined) {
        await connectInFlight.value.catch(() => {
          // ignore
        });
      }
      await writeAdapter.disconnect();
      await Promise.all(
        readAdapters
          .filter((adapter) => adapter !== writeAdapter)
          .map(async (adapter) => adapter.disconnect())
      );
      connected.value = false;
    },
  };
};

/**
 * Create query handlers
 */
const createQueryHandlers = (
  writeAdapter: IDatabaseAdapter,
  _readAdapters: IDatabaseAdapter[],
  eventEmitter: EventEmitter,
  connected: { value: boolean },
  db: IDatabase,
  getAdapter: (isRead?: boolean) => IDatabaseAdapter
): {
  query(sql: string, parameters?: unknown[], isRead?: boolean): Promise<unknown[]>;
  queryOne(sql: string, parameters?: unknown[], isRead?: boolean): Promise<unknown>;
  execute(sql: string, parameters?: unknown[], isRead?: boolean): Promise<QueryResult>;
  transaction<T>(callback: (db: IDatabase) => Promise<T>): Promise<T>;
} => {
  return {
    async query(sql: string, parameters: unknown[] = [], isRead = false) {
      if (connected.value === false) await db.connect();
      const adapter = getAdapter(isRead);
      const registry = DatabaseAdapterRegistry.list();

      // Validate that database adapters are registered
      if (registry.length === 0) {
        throw ErrorFactory.createConfigError(
          'No database adapters are registered. Call DatabaseAdapterRegistry.register() during startup to register database adapters.'
        );
      }

      return executeQuery(adapter, eventEmitter, sql, parameters, 'query');
    },
    async queryOne(sql: string, parameters: unknown[] = [], isRead = false) {
      if (connected.value === false) await db.connect();
      const adapter = getAdapter(isRead);

      // Validate that database adapters are registered
      if (DatabaseAdapterRegistry.list().length === 0) {
        throw ErrorFactory.createConfigError(
          'No database adapters are registered. Call DatabaseAdapterRegistry.register() during startup to register database adapters.'
        );
      }

      return executeQueryOne(adapter, eventEmitter, sql, parameters);
    },
    async execute(sql: string, parameters: unknown[] = [], isRead = false) {
      if (connected.value === false) await db.connect();
      const adapter = getAdapter(isRead);

      // Validate that database adapters are registered
      if (DatabaseAdapterRegistry.list().length === 0) {
        throw ErrorFactory.createConfigError(
          'No database adapters are registered. Call DatabaseAdapterRegistry.register() during startup to register database adapters.'
        );
      }

      return executeFullQuery(adapter, eventEmitter, sql, parameters);
    },
    async transaction<T>(callback: (db: IDatabase) => Promise<T>) {
      if (connected.value === false) await db.connect();

      // Validate that database adapters are registered
      if (DatabaseAdapterRegistry.list().length === 0) {
        throw ErrorFactory.createConfigError(
          'No database adapters are registered. Call DatabaseAdapterRegistry.register() during startup to register database adapters.'
        );
      }

      return writeAdapter.transaction(async () => callback(db));
    },
  };
};

const setupDbInstrumentation = (
  dbConfig: DatabaseConfig,
  eventEmitter: EventEmitter
): Array<() => void> => {
  const cleanupFunctions: Array<() => void> = [];

  const metricsCleanup = installDbMetricsIfEnabled(dbConfig, eventEmitter);
  const tracingCleanup = installDbTracingIfEnabled(dbConfig, eventEmitter);

  if (metricsCleanup) cleanupFunctions.push(metricsCleanup);
  if (tracingCleanup) cleanupFunctions.push(tracingCleanup);

  return cleanupFunctions;
};

const applyQueryHandlers = (
  db: IDatabase,
  queryHandlers: ReturnType<typeof createQueryHandlers>
): void => {
  db.query = queryHandlers.query;
  db.queryOne = queryHandlers.queryOne;
  db.execute = queryHandlers.execute;
  db.transaction = queryHandlers.transaction;
};

const createDbFacade = (input: {
  dbConfig: DatabaseConfig;
  writeAdapter: IDatabaseAdapter;
  eventEmitter: EventEmitter;
  connected: { value: boolean };
  getAdapter: (isRead?: boolean) => IDatabaseAdapter;
  connectionHandlers: ReturnType<typeof createConnectionHandlers>;
  queryHandlers: ReturnType<typeof createQueryHandlers>;
  cleanupFunctions: Array<() => void>;
}): IDatabase => {
  const {
    dbConfig,
    writeAdapter,
    eventEmitter,
    connected,
    getAdapter,
    connectionHandlers,
    queryHandlers,
    cleanupFunctions,
  } = input;

  const db: IDatabase = {
    connect: connectionHandlers.connect,
    disconnect: connectionHandlers.disconnect,
    isConnected() {
      return connected.value;
    },
    query: queryHandlers.query,
    queryOne: queryHandlers.queryOne,
    execute: queryHandlers.execute,
    transaction: queryHandlers.transaction,
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
};

const createDatabaseInstance = (dbConfig: DatabaseConfig): IDatabase => {
  const eventEmitter = new EventEmitter();
  const connected = { value: false };
  const connectInFlight = { value: undefined as Promise<void> | undefined };
  let readIndex = 0;

  const { writeAdapter, readAdapters } = initializeAdapters(dbConfig);
  const cleanupFunctions = setupDbInstrumentation(dbConfig, eventEmitter);

  const getAdapter = (isRead = false): IDatabaseAdapter => {
    if (isRead === false || readAdapters.length === 0) {
      return writeAdapter;
    }
    const adapter = readAdapters[readIndex];
    if (adapter === undefined) return writeAdapter;
    readIndex = (readIndex + 1) % readAdapters.length;
    return adapter;
  };

  const connectionHandlers = createConnectionHandlers(
    writeAdapter,
    readAdapters,
    connected,
    connectInFlight
  );

  // Create temporary handlers with db as undefined, then update after db is created
  let queryHandlers = createQueryHandlers(
    writeAdapter,
    readAdapters,
    eventEmitter,
    connected,
    {} as IDatabase,
    getAdapter
  );

  const db = createDbFacade({
    dbConfig,
    writeAdapter,
    eventEmitter,
    connected,
    getAdapter,
    connectionHandlers,
    queryHandlers,
    cleanupFunctions,
  });

  // Update handlers with actual db reference for circular dependency
  queryHandlers = createQueryHandlers(
    writeAdapter,
    readAdapters,
    eventEmitter,
    connected,
    db,
    getAdapter
  );
  applyQueryHandlers(db, queryHandlers);

  return db;
};

export const Database = Object.freeze({
  /**
   * Create a new database instance
   */
  create(config?: DatabaseConfig): IDatabase {
    const dbConfig = config ?? { driver: 'sqlite', database: ':memory:' };
    return createDatabaseInstance(dbConfig);
  },
});

const databaseInstances: Map<string, IDatabase> = new Map();

export const useEnsureDbConnected = async (
  config: DatabaseConfig | undefined = undefined,
  connectionName = 'default'
): Promise<ReturnType<typeof useDatabase>> => {
  const db = useDatabase(config, connectionName);
  if (!db.isConnected()) {
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
      instance.dispose();
    } catch {
      // Ignore errors during disconnect
    }
  });
  await Promise.all(promises);
  databaseInstances.clear();
}
