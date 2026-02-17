/**
 * Database Configuration (User Override)
 * Define your database connection overrides here.
 * The core src/config/database.ts handles all defaults and construction logic.
 * @example
 * export default {
 *   default: 'postgresql',
 *   connections: {
 *     postgresql: {
 *       driver: 'postgresql' as const,
 *       host: 'localhost',
 *       port: 5432,
 *       database: 'myapp',
 *       username: 'user',
 *       password: 'pass',
 *       ssl: true,
 *       pooling: {
 *         enabled: true,
 *         min: 10,
 *         max: 50,
 *       },
 *     },
 *   },
 *   logging: {
 *     enabled: true,
 *     level: 'query',
 *   },
 * };
 */
// @ts-ignore - config templates are excluded from the main TS project in this repo
import type { DatabaseConfigOverrides } from '@config/database';
import { Env } from '@config/env';

const parseReadHosts = (raw: string): string[] | undefined => {
  const list = String(raw ?? '')
    .split(',')
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
  return list.length > 0 ? list : undefined;
};

const connections = {
  sqlite: {
    driver: 'sqlite' as const,
    database: Env.get('DB_DATABASE_SQLITE', '.zintrust/dbs/zintrust.sqlite'),
    migrations: 'database/migrations',
  },
  d1: {
    driver: 'd1' as const,
  },
  'd1-remote': {
    driver: 'd1-remote' as const,
  },
  postgresql: {
    driver: 'postgresql' as const,
    host: Env.get('DB_HOST', 'localhost'),
    port: Env.getInt('DB_PORT_POSTGRESQL', 5432),
    database: Env.get('DB_DATABASE_POSTGRESQL', 'postgres'),
    username: Env.get('DB_USERNAME_POSTGRESQL', 'postgres'),
    password: Env.get('DB_PASSWORD_POSTGRESQL', 'pass'),
    ssl: Env.getBool('DB_SSL', false),
    readHosts: parseReadHosts(Env.get('DB_READ_HOSTS_POSTGRESQL', '127.0.0.1')),
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
    host: Env.get('DB_HOST', 'localhost'),
    port: Env.getInt('DB_PORT', 3306),
    database: Env.get('DB_DATABASE', 'zintrust'),
    username: Env.get('DB_USERNAME', 'root'),
    password: Env.get('DB_PASSWORD', 'pass'),
    readHosts: parseReadHosts(Env.get('DB_READ_HOSTS', '127.0.0.1')),
    pooling: {
      enabled: Env.getBool('DB_POOLING', true),
      min: Env.getInt('DB_POOL_MIN', 5),
      max: Env.getInt('DB_POOL_MAX', 20),
    },
  },
  sqlserver: {
    driver: 'sqlserver' as const,
    host: Env.get('DB_HOST_MSSQL', Env.get('DB_HOST', 'localhost')),
    port: Env.getInt('DB_PORT_MSSQL', 1433),
    database: Env.get('DB_DATABASE_MSSQL', 'zintrust'),
    username: Env.get('DB_USERNAME_MSSQL', 'sa'),
    password: Env.get('DB_PASSWORD_MSSQL', 'pass'),
    readHosts: parseReadHosts(Env.get('DB_READ_HOSTS_MSSQL', '127.0.0.1')),
  },
};

export default {
  default: Env.get('DB_CONNECTION', 'mysql'),
  connections,
} satisfies DatabaseConfigOverrides;
