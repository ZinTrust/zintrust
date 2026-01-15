/* eslint-disable no-await-in-loop */
/* eslint-disable @typescript-eslint/require-await */
/**
 * Persistent Connection Manager for Zintrust Framework
 * Handles database connections across different runtime environments
 * Supports: PostgreSQL, MySQL, SQL Server with connection pooling for Lambda
 */

import { Env } from '@config/env';
import { Logger } from '@config/logger';
import { ErrorFactory } from '@exceptions/ZintrustError';
import type { SupportedDriver } from '@migrations/enum';
import { D1Adapter } from '@orm/adapters/D1Adapter';
import { D1RemoteAdapter } from '@orm/adapters/D1RemoteAdapter';
import { MySQLAdapter } from '@orm/adapters/MySQLAdapter';
import { PostgreSQLAdapter } from '@orm/adapters/PostgreSQLAdapter';
import { SQLiteAdapter } from '@orm/adapters/SQLiteAdapter';
import { SQLServerAdapter } from '@orm/adapters/SQLServerAdapter';
import type { DatabaseConfig, IDatabaseAdapter } from '@orm/DatabaseAdapter';
import { DatabaseAdapterRegistry } from '@orm/DatabaseAdapterRegistry';
export interface ConnectionConfig {
  adapter: SupportedDriver;
  host?: string;
  port?: number;
  database: string;
  username?: string;
  password?: string;
  maxConnections?: number;
  idleTimeout?: number;
  connectionTimeout?: number;
  enableRdsProxy?: boolean;
  rdsProxyEndpoint?: string;
}

export interface PooledConnection {
  id: string;
  adapter: string;
  createdAt: number;
  lastUsedAt: number;
  isActive: boolean;
  queryCount: number;
}

export interface ConnectionPool {
  total: number;
  active: number;
  idle: number;
  queued: number;
}

let instance: ConnectionManagerInstance | undefined;

interface ConnectionManagerInstance {
  getConnection(id?: string): Promise<IDatabaseAdapter>;
  releaseConnection(connectionId?: string): Promise<void>;
  closeAll(): Promise<void>;
  getPoolStats(): ConnectionPool;
  enableRdsProxy(endpoint: string): Promise<void>;
  getAuroraDataApiConnection(): Promise<AuroraDataApiConnection>;
}

interface ConnectionWaiter {
  resolve: (conn: IDatabaseAdapter) => void;
  reject: (err: Error) => void;
  timeoutId?: ReturnType<typeof setTimeout>;
  cleanup: () => void;
}

interface ClientRdsDataModule {
  getRdsDataClient: (
    region?: string
  ) => Promise<{ executeStatement: (input: unknown) => Promise<unknown> }>;
  getSecretsManagerClient: (region?: string) => Promise<{
    getSecretValue: (secretName: string) => Promise<{ SecretString?: string }>;
  }>;
}

/**
 * Close a specific connection
 */
const closeConnection = async (conn: unknown): Promise<void> => {
  if (isDatabaseAdapter(conn)) {
    await conn.disconnect();
  }
};

/**
 * Test if connection is still alive
 */
const testConnection = async (_config: ConnectionConfig, conn: unknown): Promise<boolean> => {
  if (!isDatabaseAdapter(conn)) return false;
  if (!conn.isConnected()) return false;

  try {
    await conn.ping();
    return true;
  } catch (error) {
    Logger.warn('Connection health check failed', error as Error);
    return false;
  }
};

/**
 * Update connection usage metrics
 */
const updateConnectionUsage = (connectionPool: PooledConnection[], id: string): void => {
  const entry = connectionPool.find((c) => c.id === id);
  if (entry !== undefined) {
    entry.lastUsedAt = Date.now();
    entry.queryCount++;
    entry.isActive = true;
  }
};

const isDatabaseAdapter = (value: unknown): value is IDatabaseAdapter => {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as IDatabaseAdapter;
  return (
    typeof candidate.connect === 'function' &&
    typeof candidate.disconnect === 'function' &&
    typeof candidate.ping === 'function' &&
    typeof candidate.isConnected === 'function'
  );
};

const createAdapterFromConfig = (config: ConnectionConfig): IDatabaseAdapter => {
  if (config.adapter === 'aurora-data-api') {
    throw ErrorFactory.createConfigError(
      'Aurora Data API connections should be created via getAuroraDataApiConnection()'
    );
  }

  const driver: SupportedDriver = config.adapter;
  const adapterConfig: DatabaseConfig = {
    driver,
    database: config.database,
    host: config.host,
    port: config.port,
    username: config.username,
    password: config.password,
  };

  const registered = DatabaseAdapterRegistry.get(driver);
  if (registered !== undefined) {
    return registered(adapterConfig);
  }

  switch (driver) {
    case 'postgresql':
      return PostgreSQLAdapter.create(adapterConfig);
    case 'mysql':
      return MySQLAdapter.create(adapterConfig);
    case 'sqlserver':
      return SQLServerAdapter.create(adapterConfig);
    case 'd1':
      return D1Adapter.create(adapterConfig);
    case 'd1-remote':
      return D1RemoteAdapter.create(adapterConfig);
    case 'sqlite':
    default:
      return SQLiteAdapter.create(adapterConfig);
  }
};

/**
 * Create new database connection
 */
const createConnection = async (
  config: ConnectionConfig,
  id: string
): Promise<IDatabaseAdapter> => {
  Logger.info(`Creating ${config.adapter} connection (${id}) to ${config.host}:${config.port}`);

  if (config.adapter === 'aurora-data-api') {
    throw ErrorFactory.createConfigError(
      'Aurora Data API connections should be created via getAuroraDataApiConnection()'
    );
  }

  const adapter = createAdapterFromConfig(config);
  await adapter.connect();
  return adapter;
};

/**
 * Create Aurora Data API connection
 */
function isMissingEsmPackage(error: unknown, packageName: string): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const maybe = error as { code?: unknown; message?: unknown };
  const code = typeof maybe.code === 'string' ? maybe.code : '';
  const message = typeof maybe.message === 'string' ? maybe.message : '';
  if (code === 'ERR_MODULE_NOT_FOUND' && message.length === 0) return true;
  if (code === 'ERR_MODULE_NOT_FOUND' && message.includes(`'${packageName}'`)) return true;
  if (message.includes(`Cannot find package '${packageName}'`)) return true;
  return false;
}

async function importOptionalModule(modulePath: string): Promise<unknown> {
  return import(modulePath) as Promise<unknown>;
}

const loadClientRdsDataModule = async (): Promise<ClientRdsDataModule> => {
  try {
    return (await importOptionalModule('@zintrust/client-rds-data')) as ClientRdsDataModule;
  } catch (error) {
    if (isMissingEsmPackage(error, '@zintrust/client-rds-data')) {
      throw ErrorFactory.createConfigError(
        "Aurora Data API requires '@zintrust/client-rds-data' (install the package to enable AWS Data API support)."
      );
    }
    throw ErrorFactory.createTryCatchError('Failed to load @zintrust/client-rds-data', {
      cause: error,
    });
  }
};

const createAuroraDataApiConnection = (): AuroraDataApiConnection => {
  const getClient = async (): Promise<{
    executeStatement: (input: unknown) => Promise<unknown>;
  }> => {
    const mod = await loadClientRdsDataModule();
    return mod.getRdsDataClient(Env.AWS_REGION);
  };

  const resourceArn = Env.get('AURORA_RESOURCE_ARN');
  const secretArn = Env.get('AURORA_SECRET_ARN');
  const database = Env.get('AURORA_DATABASE', Env.DB_DATABASE);

  const assertConfig = (): void => {
    if (resourceArn.length === 0 || secretArn.length === 0) {
      throw ErrorFactory.createConfigError(
        'Aurora Data API requires AURORA_RESOURCE_ARN and AURORA_SECRET_ARN env vars'
      );
    }
  };

  const executeStatement = async (sql: string, params?: unknown[]): Promise<AuroraQueryResult> => {
    assertConfig();
    const client = await getClient();
    const input = {
      resourceArn,
      secretArn,
      database,
      sql,
      parameters: (params ?? []).map((value) => ({ value: { stringValue: String(value) } })),
    };

    const response = (await client.executeStatement(input)) as {
      numberOfRecordsUpdated?: number;
      records?: Array<Record<string, unknown>>;
    };

    return {
      numberOfRecordsUpdated: response.numberOfRecordsUpdated ?? 0,
      records: response.records ?? [],
    };
  };

  return {
    execute: executeStatement,
    batch: async (
      statements: Array<{ sql: string; params?: unknown[] }>
    ): Promise<AuroraQueryResult[]> => {
      const results: AuroraQueryResult[] = [];
      for (const statement of statements) {
        const result = await executeStatement(statement.sql, statement.params);
        results.push(result);
      }
      return results;
    },
  };
};

/**
 * Connection state wrapper to allow passing by reference
 */
interface ConnectionState {
  connections: Map<string, IDatabaseAdapter>;
  connectionPool: PooledConnection[];
  waiters: ConnectionWaiter[];
  cleanupInterval?: ReturnType<typeof setInterval>;
}

/**
 * Get healthy existing connection if available
 */
const getHealthyExistingConnection = async (
  config: ConnectionConfig,
  state: ConnectionState,
  id: string
): Promise<IDatabaseAdapter | null> => {
  if (!state.connections.has(id)) return null;

  const conn = state.connections.get(id);
  if (conn !== undefined && conn !== null && (await testConnection(config, conn))) {
    updateConnectionUsage(state.connectionPool, id);
    return conn;
  }

  state.connections.delete(id);
  state.connectionPool = state.connectionPool.filter((c) => c.id !== id);
  return null;
};

/**
 * Find an idle connection in the pool
 */
const findIdleConnection = (state: ConnectionState): IDatabaseAdapter | null => {
  const idleConnections = state.connectionPool.filter((c) => !c.isActive);
  if (idleConnections.length === 0) return null;

  const lru = idleConnections.reduce(
    (prev, current) => (prev.lastUsedAt < current.lastUsedAt ? prev : current),
    idleConnections[0]
  );
  updateConnectionUsage(state.connectionPool, lru.id);
  const conn = state.connections.get(lru.id);
  return conn ?? null;
};

/**
 * Wait for a connection to become available
 */
const waitForIdleConnection = async (state: ConnectionState): Promise<IDatabaseAdapter> => {
  return new Promise((resolve, reject) => {
    let timeoutId: ReturnType<typeof globalThis.setTimeout> | undefined;

    const cleanup = (): void => {
      if (timeoutId !== undefined) {
        globalThis.clearTimeout(timeoutId);
        timeoutId = undefined;
      }
    };

    const waiter: ConnectionWaiter = {
      resolve: (conn) => {
        cleanup();
        resolve(conn);
      },
      reject: (err) => {
        cleanup();
        reject(err);
      },
      timeoutId,
      cleanup,
    };

    timeoutId = globalThis.setTimeout(() => {
      state.waiters = state.waiters.filter((entry) => entry !== waiter);
      cleanup();
      reject(
        ErrorFactory.createConnectionError(
          'Connection pool exhausted - timeout waiting for available connection'
        )
      );
    }, 30000);

    waiter.timeoutId = timeoutId;

    if (isUnrefableTimer(timeoutId)) {
      timeoutId.unref();
    }

    state.waiters.push(waiter);
  });
};

type UnrefableTimer = { unref: () => void };

function isUnrefableTimer(value: unknown): value is UnrefableTimer {
  if (typeof value !== 'object' || value === null) return false;
  return 'unref' in value && typeof (value as UnrefableTimer).unref === 'function';
}

/**
 * Get or reuse a connection when at max capacity
 */
const getOrReuseConnection = async (state: ConnectionState): Promise<IDatabaseAdapter> => {
  const idle = findIdleConnection(state);
  if (idle !== null) return idle;

  return waitForIdleConnection(state);
};

/**
 * Periodically clean up idle connections
 */
const startIdleConnectionCleanup = (state: ConnectionState, idleTimeout: number): void => {
  if (state.cleanupInterval) {
    clearInterval(state.cleanupInterval);
  }

  state.cleanupInterval = setInterval(() => {
    const now = Date.now();
    const toRemove: string[] = [];

    for (const poolEntry of state.connectionPool) {
      if (!poolEntry.isActive && now - poolEntry.lastUsedAt > idleTimeout) {
        toRemove.push(poolEntry.id);
      }
    }

    for (const id of toRemove) {
      const conn = state.connections.get(id);
      closeConnection(conn).catch((err) =>
        Logger.error(`Failed to close idle connection ${id}:`, err as Error)
      );
      state.connections.delete(id);
      state.connectionPool = state.connectionPool.filter((c) => c.id !== id);
      Logger.info(`Removed idle connection: ${id}`);
    }
  }, 300000); // Every 5 minutes

  if (isUnrefableTimer(state.cleanupInterval)) {
    state.cleanupInterval.unref();
  }
};

/**
 * Create and register a new connection
 */
const createNewConnection = async (
  config: ConnectionConfig,
  state: ConnectionState,
  id: string
): Promise<IDatabaseAdapter> => {
  const connection = await createConnection(config, id);
  state.connections.set(id, connection);
  state.connectionPool.push({
    id,
    adapter: config.adapter,
    createdAt: Date.now(),
    lastUsedAt: Date.now(),
    isActive: true,
    queryCount: 0,
  });
  return connection;
};

/**
 * Close all connections (graceful shutdown)
 */
const closeAllConnections = async (state: ConnectionState): Promise<void> => {
  if (state.cleanupInterval) {
    clearInterval(state.cleanupInterval);
    state.cleanupInterval = undefined;
  }

  if (state.waiters.length > 0) {
    const err = ErrorFactory.createConnectionError('Connection manager shutting down');
    for (const waiter of state.waiters) {
      if (waiter.timeoutId !== undefined) clearTimeout(waiter.timeoutId);
      waiter.reject(err);
    }
    state.waiters = [];
  }

  for (const [id, conn] of state.connections.entries()) {
    try {
      await closeConnection(conn);
    } catch (error) {
      ErrorFactory.createConnectionError(`Failed to close connection ${id}:`, error as Error);
    }
  }
  state.connections.clear();
  state.connectionPool = [];
};

/**
 * Get connection pool statistics
 */
const getPoolStatistics = (state: ConnectionState): ConnectionPool => {
  const active = state.connectionPool.filter((c) => c.isActive).length;
  const idle = state.connectionPool.filter((c) => !c.isActive).length;

  return {
    total: state.connectionPool.length,
    active,
    idle,
    queued: state.waiters.length,
  };
};

/**
 * ConnectionManager implementation
 * Refactored to Functional Object pattern
 */
const ConnectionManagerImpl = {
  /**
   * Create a new connection manager instance
   */
  create(config: ConnectionConfig): ConnectionManagerInstance {
    const state: ConnectionState = {
      connections: new Map(),
      connectionPool: [],
      waiters: [],
    };
    const maxConnections = config.maxConnections ?? 10;
    const idleTimeout = config.idleTimeout ?? 900000; // 15 minutes

    // Cleanup idle connections every 5 minutes
    startIdleConnectionCleanup(state, idleTimeout);

    return {
      /**
       * Get or create database connection
       */
      async getConnection(id = 'default'): Promise<IDatabaseAdapter> {
        const existing = await getHealthyExistingConnection(config, state, id);
        if (existing !== null) return existing;

        if (state.connectionPool.length < maxConnections) {
          return createNewConnection(config, state, id);
        }

        return getOrReuseConnection(state);
      },

      /**
       * Release connection back to pool (but keep persistent)
       */
      async releaseConnection(connectionId: string = 'default'): Promise<void> {
        const poolEntry = state.connectionPool.find((c) => c.id === connectionId);
        if (poolEntry === undefined) return;

        poolEntry.isActive = false;
        poolEntry.lastUsedAt = Date.now();

        if (state.waiters.length === 0) return;

        const waiter = state.waiters.shift();
        if (waiter === undefined) return;

        waiter.cleanup();

        const conn = state.connections.get(connectionId);
        if (conn === undefined) {
          waiter.reject(ErrorFactory.createConnectionError('Released connection not found'));
          return;
        }

        updateConnectionUsage(state.connectionPool, connectionId);
        waiter.resolve(conn);
      },

      /**
       * Close all connections (graceful shutdown)
       */
      async closeAll(): Promise<void> {
        return closeAllConnections(state);
      },

      /**
       * Get connection pool statistics
       */
      getPoolStats(): ConnectionPool {
        return getPoolStatistics(state);
      },

      /**
       * Enable RDS Proxy for connection pooling
       */
      async enableRdsProxy(endpoint: string): Promise<void> {
        config.enableRdsProxy = true;
        config.rdsProxyEndpoint = endpoint;
        config.host = endpoint;
        Logger.info(`RDS Proxy enabled: ${endpoint}`);
      },

      /**
       * Use Aurora Data API for serverless queries (no persistent connection)
       */
      async getAuroraDataApiConnection(): Promise<AuroraDataApiConnection> {
        return createAuroraDataApiConnection();
      },
    };
  },
};

/**
 * Manages database connections across Lambda warm invocations
 * Reuses connections to reduce cold start impact and connection overhead
 * Sealed namespace object following Pattern 2
 *
 * @see FRAMEWORK_REFACTOR_FUNCTION_PATTERN.md for Pattern 2 details
 */
export const ConnectionManager = Object.freeze({
  /**
   * Get or create singleton instance
   */
  getInstance(config?: ConnectionConfig): ConnectionManagerInstance {
    if (instance === undefined && config !== undefined) {
      instance = ConnectionManagerImpl.create(config);
    }
    if (instance === undefined) {
      throw ErrorFactory.createConfigError(
        'ConnectionManager not initialized. Call getInstance(config) first.'
      );
    }
    return instance;
  },

  /**
   * Shutdown connection manager if it has been initialized
   * Safe to call even if no instance exists
   */
  async shutdownIfInitialized(): Promise<void> {
    if (instance !== undefined) {
      try {
        await instance.closeAll();
      } catch (err) {
        Logger.error('Error while shutting down ConnectionManager:', err as Error);
      }
    }
  },

  /**
   * Get or create database connection
   */
  async getConnection(id = 'default'): Promise<IDatabaseAdapter> {
    return this.getInstance().getConnection(id);
  },

  /**
   * Release connection back to pool (but keep persistent)
   */
  async releaseConnection(connectionId: string = 'default'): Promise<void> {
    return this.getInstance().releaseConnection(connectionId);
  },

  /**
   * Close all connections (graceful shutdown)
   */
  async closeAll(): Promise<void> {
    return this.getInstance().closeAll();
  },

  /**
   * Get connection pool statistics
   */
  getPoolStats(): ConnectionPool {
    return this.getInstance().getPoolStats();
  },

  /**
   * Enable RDS Proxy for connection pooling
   */
  async enableRdsProxy(endpoint: string): Promise<void> {
    return this.getInstance().enableRdsProxy(endpoint);
  },

  /**
   * Use Aurora Data API for serverless queries (no persistent connection)
   */
  async getAuroraDataApiConnection(): Promise<AuroraDataApiConnection> {
    return this.getInstance().getAuroraDataApiConnection();
  },
});

/**
 * Aurora Data API connection interface for serverless
 */
export interface AuroraDataApiConnection {
  execute(sql: string, params?: unknown[]): Promise<AuroraQueryResult>;
  batch(statements: Array<{ sql: string; params?: unknown[] }>): Promise<AuroraQueryResult[]>;
}

export interface AuroraQueryResult {
  numberOfRecordsUpdated: number;
  records: Array<Record<string, unknown>>;
}

/**
 * Get database credentials from AWS Secrets Manager
 */
export async function getDatabaseSecret(secretName: string): Promise<DatabaseSecret> {
  try {
    const mod = await loadClientRdsDataModule();
    const client = await mod.getSecretsManagerClient(Env.AWS_REGION);
    const response = await client.getSecretValue(secretName);

    const secretString = response.SecretString;
    if (secretString === undefined || secretString === null || secretString.trim().length === 0) {
      throw ErrorFactory.createConfigError('Secrets Manager returned an empty secret');
    }

    const parsed = JSON.parse(secretString) as Partial<DatabaseSecret>;
    if (
      parsed.username === undefined ||
      parsed.password === undefined ||
      parsed.host === undefined ||
      parsed.port === undefined ||
      parsed.database === undefined
    ) {
      throw ErrorFactory.createConfigError('Secrets Manager secret is missing required fields');
    }

    return {
      username: parsed.username,
      password: parsed.password,
      host: parsed.host,
      port: Number(parsed.port),
      database: parsed.database,
    };
  } catch (error) {
    throw ErrorFactory.createTryCatchError('Failed to fetch database secret', { cause: error });
  }
}

/**
 * Get database credentials from environment variables
 */
export function getDatabaseCredentialsFromEnv(): DatabaseSecret {
  return {
    username: Env.DB_USERNAME,
    password: Env.DB_PASSWORD,
    host: Env.DB_HOST,
    port: Env.DB_PORT,
    database: Env.DB_DATABASE,
  };
}

/**
 * Secrets Manager for retrieving database credentials securely
 * Sealed namespace object following Pattern 2
 *
 * @see FRAMEWORK_REFACTOR_FUNCTION_PATTERN.md for Pattern 2 details
 */
export const SecretsHelper = Object.freeze({
  getDatabaseSecret,
  getDatabaseCredentialsFromEnv,
});

export interface DatabaseSecret {
  username: string;
  password: string;
  host: string;
  port: number;
  database: string;
}
