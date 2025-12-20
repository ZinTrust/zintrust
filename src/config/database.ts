/**
 * Database Configuration
 * Database connections and pooling settings
 */

import { Env } from '@config/env';

export const databaseConfig = {
  /**
   * Default database connection
   */
  default: Env.DB_CONNECTION,

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
  getConnection() {
    const connName = this.default as keyof typeof this.connections;
    return this.connections[connName];
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
} as const;

export type DatabaseConfig = typeof databaseConfig;
