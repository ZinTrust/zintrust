/**
 * Database Configuration
 * Database connections and pooling settings
 * Sealed namespace for immutability
 */

import { Env } from './env';
import { DatabaseConfigShape, DatabaseConnectionConfig, DatabaseConnections } from './type';
import { ErrorFactory } from '@zintrust/core';

const hasOwn = (obj: Record<string, unknown>, key: string): boolean => {
  return Object.prototype.hasOwnProperty.call(obj, key);
};

const getDefaultConnection = (connections: DatabaseConnections): string => {
  const envSelectedRaw = Env.get('DB_CONNECTION', '');
  const value = String(envSelectedRaw ?? '').trim();

  if (value.length > 0 && hasOwn(connections, value)) return value;

  if (envSelectedRaw.trim().length > 0) {
    throw ErrorFactory.createConfigError(`Database connection not configured: ${value}`);
  }

  return hasOwn(connections, 'sqlite') ? 'sqlite' : (Object.keys(connections)[0] ?? 'sqlite');
};

const getDatabaseConnection = (config: DatabaseConfigShape): DatabaseConnectionConfig => {
  const connName = config.default;
  const resolved = config.connections[connName];
  if (resolved !== undefined) return resolved;

  // Backwards-compatible fallback.
  const sqliteFallback = config.connections['sqlite'];
  if (sqliteFallback !== undefined) return sqliteFallback;

  const first = Object.values(config.connections)[0];
  if (first !== undefined) return first;

  throw ErrorFactory.createConfigError(
    `No database connections are configured (default='${connName}').`
  );
};

const connections = {
  sqlite: {
    driver: 'sqlite' as const,
    database: Env.DB_DATABASE,
    migrations: 'database/migrations',
  },
  postgresql: {
    driver: 'postgresql' as const,
    host: Env.DB_HOST,
    port: Env.DB_PORT,
    database: Env.DB_DATABASE,
    username: Env.DB_USERNAME,
    password: Env.DB_PASSWORD,
    ssl: Env.getBool('DB_SSL', false),
    pooling: {
      enabled: Env.getBool('DB_POOLING', true),
      min: Env.getInt('DB_POOL_MIN', 5),
      max: Env.getInt('DB_POOL_MAX', 20),
      idleTimeout: Env.getInt('DB_IDLE_TIMEOUT', 30000),
      connectionTimeout: Env.getInt('DB_CONNECTION_TIMEOUT', 10000),
    },
  },
  mysql: {
    driver: 'mysql' as const,
    host: Env.DB_HOST,
    port: Env.DB_PORT,
    database: Env.DB_DATABASE,
    username: Env.DB_USERNAME,
    password: Env.DB_PASSWORD,
    pooling: {
      enabled: Env.getBool('DB_POOLING', true),
      min: Env.getInt('DB_POOL_MIN', 5),
      max: Env.getInt('DB_POOL_MAX', 20),
    },
  },
} satisfies DatabaseConnections;

const databaseConfigObj = {
  /**
   * Default database connection
   */
  default: getDefaultConnection(connections),

  /**
   * Database connections
   */
  connections,

  /**
   * Get current connection config
   */
  getConnection(this: DatabaseConfigShape): DatabaseConnectionConfig {
    return getDatabaseConnection(this);
  },

  /**
   * Enable query logging
   */
  logging: {
    enabled: Env.DEBUG,
    level: Env.get('DB_LOG_LEVEL', 'debug'),
  },

  /**
   * Migration settings
   */
  migrations: {
    directory: 'database/migrations',
    extension: Env.get('DB_MIGRATION_EXT', '.ts'),
  },

  /**
   * Seeding settings
   */
  seeders: {
    directory: 'database/seeders',
  },
};

export const databaseConfig = Object.freeze(databaseConfigObj);
export type DatabaseConfig = typeof databaseConfig;
