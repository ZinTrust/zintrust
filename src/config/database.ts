/**
 * Database Configuration
 * Database connections and pooling settings
 * Sealed namespace for immutability
 */

import { Env } from '@config/env';

type SqliteConnectionConfig = {
  driver: 'sqlite';
  database: string;
  migrations: string;
};

type PostgresqlConnectionConfig = {
  driver: 'postgresql';
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl: boolean;
  pooling: {
    enabled: boolean;
    min: number;
    max: number;
    idleTimeout: number;
    connectionTimeout: number;
  };
};

type MysqlConnectionConfig = {
  driver: 'mysql';
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  pooling: {
    enabled: boolean;
    min: number;
    max: number;
  };
};

type DatabaseConnections = {
  sqlite: SqliteConnectionConfig;
  postgresql: PostgresqlConnectionConfig;
  mysql: MysqlConnectionConfig;
};

type DatabaseConnectionName = keyof DatabaseConnections;
type DatabaseConnectionConfig = DatabaseConnections[DatabaseConnectionName];

type DatabaseConfigShape = {
  default: DatabaseConnectionName;
  connections: DatabaseConnections;
};

const isDatabaseConnectionName = (value: string): value is DatabaseConnectionName => {
  return value === 'sqlite' || value === 'postgresql' || value === 'mysql';
};

const getDefaultConnection = (): DatabaseConnectionName => {
  const value = Env.DB_CONNECTION;
  return isDatabaseConnectionName(value) ? value : 'sqlite';
};

const getDatabaseConnection = (config: DatabaseConfigShape): DatabaseConnectionConfig => {
  const connName: DatabaseConnectionName = config.default;
  return config.connections[connName];
};

const databaseConfigObj = {
  /**
   * Default database connection
   */
  default: getDefaultConnection(),

  /**
   * Database connections
   */
  connections: {
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
  },

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
