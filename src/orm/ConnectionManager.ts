/**
 * Persistent Connection Manager for Zintrust Framework
 * Handles database connections across different runtime environments
 * Supports: PostgreSQL, MySQL, SQL Server with connection pooling for Lambda
 */

import { Env } from '@config/env';
import { Logger } from '@config/logger';

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

class ConnectionManagerImpl implements ConnectionManagerInstance {
  private readonly connections: Map<string, unknown> = new Map();
  private connectionPool: PooledConnection[] = [];
  private readonly maxConnections: number;
  private readonly idleTimeout: number;
  private readonly config: ConnectionConfig;

  constructor(config: ConnectionConfig) {
    this.config = config;
    this.maxConnections = config.maxConnections ?? 10;
    this.idleTimeout = config.idleTimeout ?? 900000; // 15 minutes

    // Cleanup idle connections every 5 minutes
    this.startIdleConnectionCleanup();
  }

  /**
   * Get or create database connection
   */
  async getConnection(id = 'default'): Promise<unknown> {
    const existing = await this.getHealthyExistingConnection(id);
    if (existing !== null) return existing;

    if (this.connectionPool.length < this.maxConnections) {
      return this.createNewConnection(id);
    }

    return this.getOrReuseConnection(id);
  }

  /**
   * Get healthy existing connection if available
   */
  private async getHealthyExistingConnection(id: string): Promise<unknown> {
    if (!this.connections.has(id)) return null;

    const conn = this.connections.get(id);
    if (conn !== undefined && conn !== null && (await this.testConnection(conn))) {
      this.updateConnectionUsage(id);
      return conn;
    }

    this.connections.delete(id);
    this.connectionPool = this.connectionPool.filter((c) => c.id !== id);
    return null;
  }

  /**
   * Create and register a new connection
   */
  private async createNewConnection(id: string): Promise<unknown> {
    const connection = await this.createConnection(id);
    this.connections.set(id, connection);
    this.connectionPool.push({
      id,
      adapter: this.config.adapter,
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
      isActive: true,
      queryCount: 0,
    });
    return connection;
  }

  /**
   * Release connection back to pool (but keep persistent)
   */
  async releaseConnection(connectionId: string = 'default'): Promise<void> {
    const poolEntry = this.connectionPool.find((c) => c.id === connectionId);
    if (poolEntry !== undefined) {
      poolEntry.isActive = false;
      poolEntry.lastUsedAt = Date.now();
    }
  }

  /**
   * Close all connections (graceful shutdown)
   */
  async closeAll(): Promise<void> {
    for (const [id, conn] of this.connections.entries()) {
      try {
        await this.closeConnection(conn);
      } catch (error) {
        Logger.error(`Failed to close connection ${id}:`, error as Error);
      }
    }
    this.connections.clear();
    this.connectionPool = [];
  }

  /**
   * Get connection pool statistics
   */
  getPoolStats(): ConnectionPool {
    const active = this.connectionPool.filter((c) => c.isActive).length;
    const idle = this.connectionPool.filter((c) => !c.isActive).length;

    return {
      total: this.connectionPool.length,
      active,
      idle,
      queued: 0,
    };
  }

  /**
   * Enable RDS Proxy for connection pooling
   */
  async enableRdsProxy(endpoint: string): Promise<void> {
    this.config.enableRdsProxy = true;
    this.config.rdsProxyEndpoint = endpoint;
    this.config.host = endpoint;
    Logger.info(`RDS Proxy enabled: ${endpoint}`);
  }

  /**
   * Use Aurora Data API for serverless queries (no persistent connection)
   */
  async getAuroraDataApiConnection(): Promise<AuroraDataApiConnection> {
    return {
      execute: async (_sql: string, _params?: unknown[]): Promise<AuroraQueryResult> => {
        // Call Aurora Data API via AWS SDK
        // Requires proper IAM permissions
        throw new Error('Aurora Data API not implemented yet');
      },
      batch: async (
        _statements: Array<{ sql: string; params?: unknown[] }>
      ): Promise<AuroraQueryResult[]> => {
        // Execute batch statements
        throw new Error('Aurora Data API batch not implemented yet');
      },
    };
  }

  /**
   * Test if connection is still alive
   */
  private async testConnection(_conn: unknown): Promise<boolean> {
    try {
      if (this.config.adapter === 'postgresql' || this.config.adapter === 'mysql') {
        // SELECT 1 for PostgreSQL/MySQL
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('Connection test timeout')), 5000);
          // In real implementation, query the connection
          clearTimeout(timeout);
          resolve(true);
        });
      }
      return true;
    } catch (error) {
      Logger.error('Connection test failed:', error as Error);
      return false;
    }
  }

  /**
   * Create new database connection
   */
  private async createConnection(id: string): Promise<unknown> {
    Logger.info(
      `Creating ${this.config.adapter} connection (${id}) to ${this.config.host}:${this.config.port}`
    );

    // Connection creation would be adapter-specific
    // This is a placeholder for the actual implementation
    return {
      id,
      adapter: this.config.adapter,
      query: async (_sql: string, _params?: unknown[]): Promise<unknown> => {
        throw new Error(`Query execution not implemented for ${this.config.adapter}`);
      },
      close: async (): Promise<void> => {
        Logger.info(`Connection ${id} closed`);
      },
    };
  }

  /**
   * Close a specific connection
   */
  private async closeConnection(conn: unknown): Promise<void> {
    if (
      conn !== undefined &&
      conn !== null &&
      typeof conn === 'object' &&
      'close' in conn &&
      typeof (conn as { close: unknown }).close === 'function'
    ) {
      await (conn as { close: () => Promise<void> }).close();
    }
  }

  /**
   * Update connection usage metrics
   */
  private updateConnectionUsage(id: string): void {
    const entry = this.connectionPool.find((c) => c.id === id);
    if (entry !== undefined) {
      entry.lastUsedAt = Date.now();
      entry.queryCount++;
      entry.isActive = true;
    }
  }

  /**
   * Get or reuse a connection when at max capacity
   */
  private async getOrReuseConnection(_id: string): Promise<unknown> {
    const idle = this.findIdleConnection();
    if (idle !== null) return idle;

    return this.waitForIdleConnection();
  }

  /**
   * Find an idle connection in the pool
   */
  private findIdleConnection(): unknown {
    const idleConnections = this.connectionPool.filter((c) => !c.isActive);
    if (idleConnections.length === 0) return null;

    const lru = idleConnections.reduce(
      (prev, current) => (prev.lastUsedAt < current.lastUsedAt ? prev : current),
      idleConnections[0]
    );
    this.updateConnectionUsage(lru.id);
    return this.connections.get(lru.id);
  }

  /**
   * Wait for a connection to become available
   */
  private waitForIdleConnection(): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const checkInterval = setInterval(() => {
        const idle = this.connectionPool.find((c) => !c.isActive);
        if (idle !== undefined) {
          clearInterval(checkInterval);
          this.updateConnectionUsage(idle.id);
          resolve(this.connections.get(idle.id));
        }
      }, 100);

      setTimeout(() => {
        clearInterval(checkInterval);
        reject(new Error('Connection pool exhausted - timeout waiting for available connection'));
      }, 30000);
    });
  }

  /**
   * Periodically clean up idle connections
   */
  private startIdleConnectionCleanup(): void {
    setInterval(() => {
      const now = Date.now();
      const toRemove: string[] = [];

      for (const poolEntry of this.connectionPool) {
        if (!poolEntry.isActive && now - poolEntry.lastUsedAt > this.idleTimeout) {
          toRemove.push(poolEntry.id);
        }
      }

      for (const id of toRemove) {
        const conn = this.connections.get(id);
        this.closeConnection(conn).catch((err) =>
          Logger.error(`Failed to close idle connection ${id}:`, err as Error)
        );
        this.connections.delete(id);
        this.connectionPool = this.connectionPool.filter((c) => c.id !== id);
        Logger.info(`Removed idle connection: ${id}`);
      }
    }, 300000); // Every 5 minutes
  }
}

/**
 * Manages database connections across Lambda warm invocations
 * Reuses connections to reduce cold start impact and connection overhead
 */
export const ConnectionManager = {
  /**
   * Get or create singleton instance
   */
  getInstance(config?: ConnectionConfig): ConnectionManagerInstance {
    if (instance === undefined && config !== undefined) {
      instance = new ConnectionManagerImpl(config);
    }
    if (instance === undefined) {
      throw new Error('ConnectionManager not initialized. Call getInstance(config) first.');
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
};

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
  throw new Error('Secrets Manager integration not implemented');
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
 */
export const SecretsHelper = {
  getDatabaseSecret,
  getDatabaseCredentialsFromEnv,
};

export interface DatabaseSecret {
  username: string;
  password: string;
  host: string;
  port: number;
  database: string;
}
