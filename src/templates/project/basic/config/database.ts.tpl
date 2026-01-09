/**
 * Database Configuration
 * Database connections and pooling settings
 * Sealed namespace for immutability
 */

import { Env , ErrorFactory} from '@zintrust/core';
import type { DatabaseConfigShape, DatabaseConnectionConfig, DatabaseConnections } from '@zintrust/core';

const isNodeProcess = (): boolean => {
  return typeof process !== 'undefined' && typeof process.cwd === 'function';
};

const isExplicitEnvValue = (key: string): boolean => {
  if (!isNodeProcess()) return false;
  const raw = process.env[key];
  return typeof raw === 'string' && raw.trim() !== '';
};

const looksLikeSqliteFilePath = (value: string): boolean => {
  const v = value.trim();
  if (v === '') return false;
  if (v === ':memory:') return true;

  if (v.includes('/') || v.includes('\\')) return true;
  if (v.startsWith('.')) return true;
  if (v.startsWith('~')) return true;
  if (v.endsWith('.sqlite') || v.endsWith('.db')) return true;

  return false;
};

const toSafeDbBasename = (raw: string): string => {
  const trimmed = raw.trim();
  if (trimmed === '') return 'zintrust';

  const normalized = trimmed
    .toLowerCase()
    .replaceAll(/[^a-z0-9_-]+/g, '-')
    .replaceAll(/-+/g, '-')
    .replaceAll(/^-+|-+$/g, '');

  return normalized !== '' ? normalized : 'zintrust';
};

const resolveSqliteDefaultBasename = (): string => {
  const service = typeof process.env['SERVICE_NAME'] === 'string' ? process.env['SERVICE_NAME'] : '';
  if (service.trim() !== '') return toSafeDbBasename(service);

  const app = typeof process.env['APP_NAME'] === 'string' ? process.env['APP_NAME'] : '';
  if (app.trim() !== '') return toSafeDbBasename(app);

  return 'zintrust';
};

const resolveDefaultSqliteDatabasePath = (): string => {
  // Respect explicit sqlite *file path* configuration.
  // Note: we intentionally treat plain names like "zintrust" as placeholders, not file paths.
  if (isExplicitEnvValue('DB_DATABASE') || isExplicitEnvValue('DB_PATH')) {
    const configured = Env.DB_DATABASE;
    if (looksLikeSqliteFilePath(configured)) return configured;
  }

  // Only change the default behavior for dev/testing; production should be explicit.
  if (!isNodeProcess() || Env.NODE_ENV === 'production') return Env.DB_DATABASE;

  // Store dev sqlite files in project-local metadata folder.
  // Note: the SQLite adapter ensures the parent directory exists.
  const base = resolveSqliteDefaultBasename();
  return `.zintrust/dbs/${base}.sqlite`;
};

const hasOwn = (obj: Record<string, unknown>, key: string): boolean => {
  return Object.hasOwn(obj, key);
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
    database: resolveDefaultSqliteDatabasePath(),
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
