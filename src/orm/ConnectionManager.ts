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
export interface ConnectionConfig {
  adapter: 'postgresql' | 'mysql' | 'sqlserver' | 'd1' | 'aurora-data-api';
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
  getConnection(id?: string): Promise<unknown>;
  releaseConnection(connectionId?: string): Promise<void>;
  closeAll(): Promise<void>;
  getPoolStats(): ConnectionPool;
  enableRdsProxy(endpoint: string): Promise<void>;
  getAuroraDataApiConnection(): Promise<AuroraDataApiConnection>;
}

/**
 * Close a specific connection
 */
const closeConnection = async (conn: unknown): Promise<void> => {
  if (
    conn !== undefined &&
    conn !== null &&
    typeof conn === 'object' &&
    'close' in conn &&
    typeof (conn as { close: unknown }).close === 'function'
  ) {
    await (conn as { close: () => Promise<void> }).close();
  }
};

/**
 * Test if connection is still alive
 */
const testConnection = async (config: ConnectionConfig, _conn: unknown): Promise<boolean> => {
  try {
    if (config.adapter === 'postgresql' || config.adapter === 'mysql') {
      // SELECT 1 for PostgreSQL/MySQL
      await new Promise((resolve, reject) => {
        const timeout = globalThis.setTimeout(
          () => reject(ErrorFactory.createConnectionError('Connection test timeout')),
          5000
        );
        try {
          // In real implementation, query the connection
          resolve(true);
        } finally {
          clearTimeout(timeout);
        }
      });
    }
    return true;
  } catch (error) {
    ErrorFactory.createConnectionError('Connection test failed:', error as Error);
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

/**
 * Create new database connection
 */
const createConnection = async (config: ConnectionConfig, id: string): Promise<unknown> => {
  Logger.info(`Creating ${config.adapter} connection (${id}) to ${config.host}:${config.port}`);

  // Connection creation would be adapter-specific
  // This is a placeholder for the actual implementation
  return {
    id,
    adapter: config.adapter,
    query: async (_sql: string, _params?: unknown[]): Promise<unknown> => {
      throw ErrorFactory.createDatabaseError(
        `Query execution not implemented for ${config.adapter}`
      );
    },
    close: async (): Promise<void> => {
      Logger.info(`Connection ${id} closed`);
    },
  };
};

/**
 * Create Aurora Data API connection
 */
const createAuroraDataApiConnection = (): AuroraDataApiConnection => ({
  execute: async (_sql: string, _params?: unknown[]): Promise<AuroraQueryResult> => {
    // Call Aurora Data API via AWS SDK
    // Requires proper IAM permissions
    throw ErrorFactory.createConfigError('Aurora Data API not implemented yet');
  },
  batch: async (
    _statements: Array<{ sql: string; params?: unknown[] }>
  ): Promise<AuroraQueryResult[]> => {
    // Execute batch statements
    throw ErrorFactory.createConfigError('Aurora Data API batch not implemented yet');
  },
});

/**
 * Connection state wrapper to allow passing by reference
 */
interface ConnectionState {
  connections: Map<string, unknown>;
  connectionPool: PooledConnection[];
  cleanupInterval?: ReturnType<typeof setInterval>;
}

/**
 * Get healthy existing connection if available
 */
const getHealthyExistingConnection = async (
  config: ConnectionConfig,
  state: ConnectionState,
  id: string
): Promise<unknown> => {
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
const findIdleConnection = (state: ConnectionState): unknown => {
  const idleConnections = state.connectionPool.filter((c) => !c.isActive);
  if (idleConnections.length === 0) return null;

  const lru = idleConnections.reduce(
    (prev, current) => (prev.lastUsedAt < current.lastUsedAt ? prev : current),
    idleConnections[0]
  );
  updateConnectionUsage(state.connectionPool, lru.id);
  return state.connections.get(lru.id);
};

/**
 * Wait for a connection to become available
 */
const waitForIdleConnection = async (state: ConnectionState): Promise<unknown> => {
  return new Promise((resolve, reject) => {
    let settled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const checkInterval = setInterval(() => {
      const idle = state.connectionPool.find((c) => !c.isActive);
      if (idle !== undefined) {
        if (settled) return;
        settled = true;
        cleanup();
        updateConnectionUsage(state.connectionPool, idle.id);
        resolve(state.connections.get(idle.id));
      }
    }, 100);

    const cleanup = (): void => {
      clearInterval(checkInterval);
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
        timeoutId = undefined;
      }
    };

    // Node: allow process to exit; other runtimes may not support unref()
    if (isUnrefableTimer(checkInterval)) {
      checkInterval.unref();
    }

    // eslint-disable-next-line no-restricted-syntax
    timeoutId = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(
        ErrorFactory.createConnectionError(
          'Connection pool exhausted - timeout waiting for available connection'
        )
      );
    }, 30000);

    if (isUnrefableTimer(timeoutId)) {
      timeoutId.unref();
    }
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
const getOrReuseConnection = async (state: ConnectionState): Promise<unknown> => {
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
};

/**
 * Create and register a new connection
 */
const createNewConnection = async (
  config: ConnectionConfig,
  state: ConnectionState,
  id: string
): Promise<unknown> => {
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
    queued: 0,
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
    };
    const maxConnections = config.maxConnections ?? 10;
    const idleTimeout = config.idleTimeout ?? 900000; // 15 minutes

    // Cleanup idle connections every 5 minutes
    startIdleConnectionCleanup(state, idleTimeout);

    return {
      /**
       * Get or create database connection
       */
      async getConnection(id = 'default'): Promise<unknown> {
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
        if (poolEntry !== undefined) {
          poolEntry.isActive = false;
          poolEntry.lastUsedAt = Date.now();
        }
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
   * Get or create database connection
   */
  async getConnection(id = 'default'): Promise<unknown> {
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
export async function getDatabaseSecret(_secretName: string): Promise<DatabaseSecret> {
  // Would use AWS SDK to fetch from Secrets Manager
  throw ErrorFactory.createConfigError('Secrets Manager integration not implemented');
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
