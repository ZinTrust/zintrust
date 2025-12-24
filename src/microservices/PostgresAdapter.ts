import { Logger } from '@config/logger';
import { ErrorFactory } from '@exceptions/ZintrustError';

/**
 * Minimal interfaces for PostgreSQL to avoid direct dependency on 'pg' types
 */
export interface PostgresPool {
  connect(): Promise<PostgresClient>;
  query(sql: string, params?: unknown[]): Promise<{ rows: unknown[]; rowCount?: number }>;
  end(): Promise<void>;
  on(event: string, listener: (...args: unknown[]) => void): this;
  totalCount: number;
  idleCount: number;
  waitingCount: number;
}

export interface PostgresClient {
  query(sql: string, params?: unknown[]): Promise<{ rows: unknown[]; rowCount?: number }>;
  release(): void;
}

export type PoolClient = PostgresClient;

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

export interface IPostgresAdapter {
  getPoolKey(): string;
  connect(): Promise<void>;
  getPool(): PostgresPool;
  query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]>;
  execute<T = unknown>(sql: string, params?: unknown[]): Promise<{ rows: T[]; rowCount: number }>;
  transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T>;
  getPoolStats(): {
    totalConnections: number;
    idleConnections: number;
    waitingRequests: number;
  };
  disconnect(): Promise<void>;
  disconnectAll(): Promise<void>;
  createServiceSchema(schemaName: string): Promise<void>;
  runMigrations(migrations: Array<{ up: (client: PoolClient) => Promise<void> }>): Promise<void>;
  healthCheck(): Promise<boolean>;
}

/**
 * PostgreSQL Adapter with Connection Pooling
 * Supports both shared (multi-service) and isolated (per-service) database modes
 */
type PostgresAdapterConstructor = {
  new (config: PostgresPoolConfig): IPostgresAdapter;
  create(config: PostgresPoolConfig): IPostgresAdapter;
  prototype: IPostgresAdapter;
};

const poolsByInstance = new WeakMap<IPostgresAdapter, Map<string, PostgresPool>>();
const configByInstance = new WeakMap<IPostgresAdapter, PostgresPoolConfig>();

function getAdapterConfig(adapter: IPostgresAdapter): PostgresPoolConfig {
  const config = configByInstance.get(adapter);
  if (config === undefined) {
    throw ErrorFactory.createConfigError('PostgresAdapter not initialized');
  }
  return config;
}

function getPools(adapter: IPostgresAdapter): Map<string, PostgresPool> {
  const pools = poolsByInstance.get(adapter);
  if (pools === undefined) {
    throw ErrorFactory.createConfigError('PostgresAdapter not initialized');
  }
  return pools;
}

// Function-constructor implementation (no `class` keyword) but still constructable via `new`.
function PostgresAdapterImpl(this: IPostgresAdapter, config: PostgresPoolConfig): void {
  const adapterConfig: PostgresPoolConfig = {
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
    isolation: 'shared',
    ...config,
  };

  poolsByInstance.set(this, new Map());
  configByInstance.set(this, adapterConfig);
}

PostgresAdapterImpl.prototype.getPoolKey = function getPoolKey(this: IPostgresAdapter): string {
  const adapterConfig = getAdapterConfig(this);
  if (adapterConfig.isolation === 'isolated' && adapterConfig.serviceName !== undefined) {
    return `${adapterConfig.host}:${adapterConfig.port}/${adapterConfig.serviceName}`;
  }
  return `${adapterConfig.host}:${adapterConfig.port}/${adapterConfig.database}`;
};

PostgresAdapterImpl.prototype.connect = async function connect(
  this: IPostgresAdapter
): Promise<void> {
  const adapterConfig = getAdapterConfig(this);
  const pools = getPools(this);
  return runConnect(adapterConfig, pools, () => this.getPoolKey());
};

PostgresAdapterImpl.prototype.getPool = function getPool(this: IPostgresAdapter): PostgresPool {
  const pools = getPools(this);
  return runGetPool(pools, () => this.getPoolKey());
};

PostgresAdapterImpl.prototype.query = async function query<T = unknown>(
  this: IPostgresAdapter,
  sql: string,
  params?: unknown[]
): Promise<T[]> {
  return runQuery<T>(this.getPool(), sql, params);
};

PostgresAdapterImpl.prototype.execute = async function execute<T = unknown>(
  this: IPostgresAdapter,
  sql: string,
  params?: unknown[]
): Promise<{ rows: T[]; rowCount: number }> {
  return runExecute<T>(this.getPool(), sql, params);
};

PostgresAdapterImpl.prototype.transaction = async function transaction<T>(
  this: IPostgresAdapter,
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  return runTransaction<T>(this.getPool(), callback);
};

PostgresAdapterImpl.prototype.getPoolStats = function getPoolStats(this: IPostgresAdapter): {
  totalConnections: number;
  idleConnections: number;
  waitingRequests: number;
} {
  return runGetPoolStats(this.getPool());
};

PostgresAdapterImpl.prototype.disconnect = async function disconnect(
  this: IPostgresAdapter
): Promise<void> {
  const pools = getPools(this);
  return runDisconnect(pools, () => this.getPoolKey());
};

PostgresAdapterImpl.prototype.disconnectAll = async function disconnectAll(
  this: IPostgresAdapter
): Promise<void> {
  const pools = getPools(this);
  return runDisconnectAll(pools);
};

PostgresAdapterImpl.prototype.createServiceSchema = async function createServiceSchema(
  this: IPostgresAdapter,
  schemaName: string
): Promise<void> {
  const adapterConfig = getAdapterConfig(this);
  return runCreateServiceSchema(this, adapterConfig.isolation, schemaName);
};

PostgresAdapterImpl.prototype.runMigrations = async function runMigrationsPublic(
  this: IPostgresAdapter,
  migrations: Array<{ up: (client: PoolClient) => Promise<void> }>
): Promise<void> {
  return runMigrations(this.getPool(), migrations);
};

PostgresAdapterImpl.prototype.healthCheck = async function healthCheck(
  this: IPostgresAdapter
): Promise<boolean> {
  return runHealthCheck(this.getPool());
};

export const PostgresAdapter = PostgresAdapterImpl as unknown as PostgresAdapterConstructor;

PostgresAdapter.create = (config: PostgresPoolConfig): IPostgresAdapter =>
  new PostgresAdapter(config);

/**
 * Internal function to get connection pool
 */
function runGetPool(pools: Map<string, PostgresPool>, getPoolKey: () => string): PostgresPool {
  const poolKey = getPoolKey();
  const pool = pools.get(poolKey);
  if (pool === undefined) {
    throw ErrorFactory.createConnectionError(
      'Connection pool not initialized. Call connect() first.',
      { poolKey }
    );
  }
  return pool;
}

/**
 * Internal function to get pool statistics
 */
function runGetPoolStats(pool: PostgresPool): {
  totalConnections: number;
  idleConnections: number;
  waitingRequests: number;
} {
  return {
    totalConnections: pool.totalCount,
    idleConnections: pool.idleCount,
    waitingRequests: pool.waitingCount,
  };
}

/**
 * Internal function to disconnect a pool
 */
async function runDisconnect(
  pools: Map<string, PostgresPool>,
  getPoolKey: () => string
): Promise<void> {
  const poolKey = getPoolKey();
  const pool = pools.get(poolKey);

  if (pool !== undefined) {
    await pool.end();
    pools.delete(poolKey);
    Logger.info(`🔌 PostgreSQL disconnected: ${poolKey}`);
  }
}

/**
 * Internal function to disconnect all pools
 */
async function runDisconnectAll(pools: Map<string, PostgresPool>): Promise<void> {
  const promises = Array.from(pools.values()).map(async (pool) => pool.end());
  await Promise.all(promises);
  pools.clear();
  Logger.info('🔌 All PostgreSQL pools disconnected');
}

/**
 * Internal function to connect to PostgreSQL
 */
async function runConnect(
  adapterConfig: PostgresPoolConfig,
  pools: Map<string, PostgresPool>,
  getPoolKey: () => string
): Promise<void> {
  const poolKey = getPoolKey();

  if (pools.has(poolKey) === true) {
    Logger.info(`♻️  Reusing existing connection pool: ${poolKey}`);
    return;
  }

  try {
    // Dynamic import to keep core zero-dependency
    // @ts-expect-error: pg might not be installed in core
    const { Pool } = await import('pg');
    const pool = new Pool({
      host: adapterConfig.host,
      port: adapterConfig.port,
      database: adapterConfig.database,
      user: adapterConfig.user,
      password: adapterConfig.password,
      max: adapterConfig.max,
      idleTimeoutMillis: adapterConfig.idleTimeoutMillis,
      connectionTimeoutMillis: adapterConfig.connectionTimeoutMillis,
    }) as unknown as PostgresPool;

    pool.on('error', (err: unknown) => {
      Logger.error(`Unexpected error on idle client for ${poolKey}`, err as Error);
    });

    const client = await pool.connect();
    Logger.info(
      `✅ PostgreSQL connected: ${adapterConfig.host}:${adapterConfig.port}/${adapterConfig.database}`
    );
    client.release();

    pools.set(poolKey, pool);
    Logger.info(`🐘 PostgreSQL pool initialized: ${poolKey}`);
  } catch (error) {
    throw ErrorFactory.createTryCatchError(
      `Failed to initialize PostgreSQL pool: ${(error as Error).message}`,
      error
    );
  }
}

/**
 * Internal function to execute a query
 */
async function runQuery<T = unknown>(
  pool: PostgresPool,
  sql: string,
  params?: unknown[]
): Promise<T[]> {
  try {
    const result = await pool.query(sql, params);
    return result.rows as T[];
  } catch (error) {
    Logger.error(`PostgreSQL query failed: ${sql}`, error as Error);
    throw error;
  }
}

/**
 * Internal function to execute a query and return full result
 */
async function runExecute<T = unknown>(
  pool: PostgresPool,
  sql: string,
  params?: unknown[]
): Promise<{ rows: T[]; rowCount: number }> {
  try {
    const result = await pool.query(sql, params);
    return {
      rows: result.rows as T[],
      rowCount: result.rowCount ?? 0,
    };
  } catch (err) {
    Logger.error(`PostgreSQL execute failed: ${sql}`, err as Error);
    throw err;
  }
}

/**
 * Internal function to run a transaction
 */
async function runTransaction<T>(
  pool: PostgresPool,
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    Logger.error('Transaction failed, rolling back', err as Error);
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Internal function to create service schema
 */
async function runCreateServiceSchema(
  adapter: IPostgresAdapter,
  isolation: string | undefined,
  schemaName: string
): Promise<void> {
  if (isolation !== 'isolated') {
    Logger.info('ℹ️  Shared database mode: skipping schema creation');
    return;
  }

  try {
    await adapter.query(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`);
    Logger.info(`✅ Schema created: ${schemaName}`);
  } catch (err) {
    Logger.error(`Schema creation failed: ${schemaName}`, err as Error);
  }
}

/**
 * Internal function to run migrations
 */
async function runMigrations(
  pool: PostgresPool,
  migrations: Array<{ up: (client: PoolClient) => Promise<void> }>
): Promise<void> {
  const client = await pool.connect();

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
 * Internal function for health check
 */
async function runHealthCheck(pool: PostgresPool): Promise<boolean> {
  try {
    const result = await pool.query('SELECT 1');
    return result.rows.length > 0;
  } catch (error) {
    Logger.error('PostgreSQL health check failed', error as Error);
    return false;
  }
}

/**
 * Global PostgreSQL adapter instance management
 */
const instances: Map<string, IPostgresAdapter> = new Map();

/**
 * Get or create adapter instance
 */
export function getInstance(config: PostgresPoolConfig, key: string = 'default'): IPostgresAdapter {
  const existing = instances.get(key);
  if (existing !== undefined) {
    return existing;
  }

  const created = PostgresAdapter.create(config);
  instances.set(key, created);
  return created;
}

/**
 * Get all instances
 */
export function getAllInstances(): IPostgresAdapter[] {
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

export const PostgresAdapterManager = Object.freeze({
  getInstance,
  getAllInstances,
  disconnectAll,
});

export default PostgresAdapter;
