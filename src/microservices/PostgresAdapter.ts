import { Logger } from '@config/logger';

/**
 * Minimal interfaces for PostgreSQL to avoid direct dependency on 'pg' types
 */
interface PostgresPool {
  connect(): Promise<PostgresClient>;
  query(sql: string, params?: unknown[]): Promise<{ rows: unknown[]; rowCount?: number }>;
  end(): Promise<void>;
  on(event: string, listener: (...args: unknown[]) => void): this;
  totalCount: number;
  idleCount: number;
  waitingCount: number;
}

interface PostgresClient {
  query(sql: string, params?: unknown[]): Promise<{ rows: unknown[]; rowCount?: number }>;
  release(): void;
}

type PoolClient = PostgresClient;

/**
 * PostgreSQL Connection Pool Configuration
 */
export interface PostgresPoolConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  max?: number; // Maximum connections in pool
  idleTimeoutMillis?: number; // How long a client can idle before being disconnected
  connectionTimeoutMillis?: number;
  serviceName?: string; // Service identifier
  isolation?: 'shared' | 'isolated'; // Database isolation mode
}

/**
 * PostgreSQL Adapter with Connection Pooling
 * Supports both shared (multi-service) and isolated (per-service) database modes
 */
export class PostgresAdapter {
  private readonly pools: Map<string, PostgresPool> = new Map();
  private readonly config: PostgresPoolConfig;

  constructor(config: PostgresPoolConfig) {
    this.config = {
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
      isolation: 'shared',
      ...config,
    };
  }

  /**
   * Initialize connection pool
   */
  public async connect(): Promise<void> {
    const poolKey = this.getPoolKey();

    // Reuse existing pool if available
    if (this.pools.has(poolKey) === true) {
      Logger.info(`♻️  Reusing existing connection pool: ${poolKey}`);
      return;
    }

    try {
      // Dynamic import to keep core zero-dependency
      // @ts-expect-error: pg might not be installed in core
      const { Pool } = await import('pg');
      const pool = new Pool({
        host: this.config.host,
        port: this.config.port,
        database: this.config.database,
        user: this.config.user,
        password: this.config.password,
        max: this.config.max,
        idleTimeoutMillis: this.config.idleTimeoutMillis,
        connectionTimeoutMillis: this.config.connectionTimeoutMillis,
      }) as unknown as PostgresPool;

      pool.on('error', (err: unknown) => {
        Logger.error(`Unexpected error on idle client for ${poolKey}`, err as Error);
      });

      // Test connection
      const client = await pool.connect();
      Logger.info(
        `✅ PostgreSQL connected: ${this.config.host}:${this.config.port}/${this.config.database}`
      );
      client.release();

      this.pools.set(poolKey, pool);
      Logger.info(`🐘 PostgreSQL pool initialized: ${poolKey}`);
    } catch (error) {
      Logger.error(`Failed to initialize PostgreSQL pool:`, error);
      throw new Error(`Failed to initialize PostgreSQL pool: ${(error as Error).message}`);
    }
  }

  /**
   * Get connection pool
   */
  public getPool(): PostgresPool {
    const poolKey = this.getPoolKey();
    const pool = this.pools.get(poolKey);
    if (pool === undefined) {
      throw new Error('Connection pool not initialized. Call connect() first.');
    }
    return pool;
  }

  /**
   * Execute a query and return rows
   */
  public async query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]> {
    const pool = this.getPool();
    try {
      const result = await pool.query(sql, params);
      return result.rows as T[];
    } catch (error) {
      Logger.error(`PostgreSQL query failed: ${sql}`, error);
      throw error;
    }
  }

  /**
   * Execute a query and return full result
   */
  public async execute<T = unknown>(
    sql: string,
    params?: unknown[]
  ): Promise<{ rows: T[]; rowCount: number }> {
    const pool = this.getPool();

    try {
      const result = await pool.query(sql, params);
      return {
        rows: result.rows as T[],
        rowCount: result.rowCount ?? 0,
      };
    } catch (err) {
      Logger.error(`PostgreSQL execute failed: ${sql}`, err);
      throw err;
    }
  }

  /**
   * Execute multiple queries in a transaction
   */
  public async transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
    const pool = this.getPool();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      Logger.error('Transaction failed, rolling back', err);
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Get pool statistics
   */
  public getPoolStats(): {
    totalConnections: number;
    idleConnections: number;
    waitingRequests: number;
  } {
    const pool = this.getPool();
    return {
      totalConnections: pool.totalCount,
      idleConnections: pool.idleCount,
      waitingRequests: pool.waitingCount,
    };
  }

  /**
   * Close connection pool
   */
  public async disconnect(): Promise<void> {
    const poolKey = this.getPoolKey();
    const pool = this.pools.get(poolKey);

    if (pool !== undefined) {
      await pool.end();
      this.pools.delete(poolKey);
      Logger.info(`🔌 PostgreSQL disconnected: ${poolKey}`);
    }
  }

  /**
   * Close all pools
   */
  public async disconnectAll(): Promise<void> {
    const promises = Array.from(this.pools.values()).map((pool) => pool.end());
    await Promise.all(promises);
    this.pools.clear();
    Logger.info('🔌 All PostgreSQL pools disconnected');
  }

  /**
   * Get unique pool key based on configuration
   */
  private getPoolKey(): string {
    if (this.config.isolation === 'isolated' && this.config.serviceName !== undefined) {
      return `${this.config.host}:${this.config.port}/${this.config.serviceName}`;
    }
    return `${this.config.host}:${this.config.port}/${this.config.database}`;
  }

  /**
   * Create database schema for service (if isolated)
   */
  public async createServiceSchema(schemaName: string): Promise<void> {
    if (this.config.isolation !== 'isolated') {
      Logger.info('ℹ️  Shared database mode: skipping schema creation');
      return;
    }

    try {
      await this.query(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`);
      Logger.info(`✅ Schema created: ${schemaName}`);
    } catch (err) {
      Logger.error(`Schema creation failed: ${schemaName}`, err);
    }
  }

  /**
   * Run migrations for service
   */
  public async runMigrations(
    migrations: Array<{ up: (client: PoolClient) => Promise<void> }>
  ): Promise<void> {
    const client = await this.getPool().connect();

    try {
      for (const migration of migrations) {
        await migration.up(client);
      }
      Logger.info(`✅ Migrations completed`);
    } finally {
      client.release();
    }
  }

  /**
   * Health check
   */
  public async healthCheck(): Promise<boolean> {
    try {
      const pool = this.getPool();
      const result = await pool.query('SELECT 1');
      return result.rows.length > 0;
    } catch (error) {
      Logger.error('PostgreSQL health check failed', error);
      return false;
    }
  }
}

/**
 * Global PostgreSQL adapter instance management
 */

const instances: Map<string, PostgresAdapter> = new Map();

/**
 * Get or create adapter instance
 */
export function getInstance(config: PostgresPoolConfig, key: string = 'default'): PostgresAdapter {
  let instance = instances.get(key);
  if (instance === undefined) {
    instance = new PostgresAdapter(config);
    instances.set(key, instance);
  }
  return instance;
}

/**
 * Get all instances
 */
export function getAllInstances(): PostgresAdapter[] {
  return Array.from(instances.values());
}

/**
 * Disconnect all instances
 */
export async function disconnectAll(): Promise<void> {
  for (const adapter of instances.values()) {
    await adapter.disconnectAll();
  }
  instances.clear();
}

export const PostgresAdapterManager = {
  getInstance,
  getAllInstances,
  disconnectAll,
};

export default PostgresAdapter;
