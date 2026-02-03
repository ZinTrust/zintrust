/**
 * Database Configuration
 * Database connections and pooling settings
 * Sealed namespace for immutability
 */

import { Cloudflare } from '@config/cloudflare';
import { Env } from '@config/env';
import type {
  DatabaseConfigShape,
  DatabaseConnectionConfig,
  DatabaseConnections,
} from '@config/type';
import { ErrorFactory } from '@exceptions/ZintrustError';
import { StartupConfigFile, StartupConfigFileRegistry } from '@runtime/StartupConfigFileRegistry';

export type DatabaseConfigOverrides = Partial<{
  default: string;
  connections: DatabaseConnections;
  logging: { enabled: boolean; level: string };
  migrations: { directory: string; extension: string };
  seeders: { directory: string };
}>;

const isNodeProcess = (): boolean => {
  return typeof process !== 'undefined' && typeof process.cwd === 'function';
};

const readEnvString = (key: string, fallback: string = ''): string => {
  const anyEnv = Env as { get?: (k: string, d?: string) => string };
  const fromEnv = typeof anyEnv.get === 'function' ? anyEnv.get(key, fallback) : fallback;
  if (typeof fromEnv === 'string' && fromEnv.trim() !== '') return fromEnv;

  if (typeof process !== 'undefined') {
    const raw = process.env?.[key];
    if (typeof raw === 'string' && raw.trim() !== '') return raw;
  }

  return fromEnv ?? '';
};

const readWorkersEnvString = (key: string): string => {
  const workerValue = Cloudflare.getWorkersVar(key);
  if (workerValue !== null && workerValue.trim() !== '') return workerValue;
  return '';
};

const readWorkersFallbackString = (workersKey: string, fallbackKey: string): string => {
  const workerValue = readWorkersEnvString(workersKey);
  if (workerValue.trim() !== '') return workerValue;

  // Also check if the fallback key is present in the Workers bindings (e.g. DB_PASSWORD)
  const fallbackWorkerValue = readWorkersEnvString(fallbackKey);
  if (fallbackWorkerValue.trim() !== '') return fallbackWorkerValue;

  return readEnvString(fallbackKey, '');
};

const readWorkersFallbackInt = (
  workersKey: string,
  fallbackKey: string,
  fallback: number
): number => {
  const raw = readWorkersFallbackString(workersKey, fallbackKey);
  if (raw.trim() === '') return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const isExplicitEnvValue = (key: string): boolean => {
  if (!isNodeProcess()) return false;

  const direct = (Env as Record<string, unknown>)[key];
  if (typeof direct === 'string' && direct.trim() !== '') return true;

  const raw = process.env[key] ?? Env.get(key, '');
  return typeof raw === 'string' && raw.trim() !== '';
};

const looksLikeSqliteFilePath = (value?: string): boolean => {
  const v = String(value ?? '').trim();
  if (v === '') return false;
  if (v === ':memory:') return true;

  // Heuristic: if it's a path, has an extension, or is explicitly relative.
  if (v.includes('/') || v.includes('\\')) return true;
  if (v.startsWith('.')) return true;
  if (v.startsWith('~')) return true;
  if (v.endsWith('.sqlite') || v.endsWith('.db')) return true;

  // Otherwise it's likely a placeholder name (e.g. "zintrust"), not a file path.
  return false;
};

const toSafeDbBasename = (raw: string): string => {
  const trimmed = raw.trim();
  if (trimmed === '') return 'zintrust';

  // Conservative filename allowlist: letters/numbers/_/-, collapse everything else.
  // Avoid regexes that can exhibit catastrophic backtracking; do deterministic collapsing/trimming.
  const collapsed = trimmed.toLowerCase().replaceAll(/[^a-z0-9_-]+/g, '-');

  // Collapse consecutive hyphens deterministically without regex backtracking.
  let normalized = '';
  let prevHyphen = false;
  for (const element of collapsed) {
    const ch = element;
    if (ch === '-') {
      if (!prevHyphen) {
        normalized += ch;
        prevHyphen = true;
      }
    } else {
      normalized += ch;
      prevHyphen = false;
    }
  }

  // Trim leading/trailing hyphens deterministically without regex.
  let start = 0;
  let end = normalized.length;
  while (start < end && normalized.charAt(start) === '-') start++;
  while (end > start && normalized.charAt(end - 1) === '-') end--;
  const result = normalized.slice(start, end);

  return result === '' ? 'zintrust' : result;
};

const resolveSqliteDefaultBasename = (): string => {
  const service =
    typeof Env.SERVICE_NAME === 'string' && Env.SERVICE_NAME.trim() !== ''
      ? Env.SERVICE_NAME
      : readEnvString('SERVICE_NAME', '');
  if (service.trim() !== '') return toSafeDbBasename(service);

  const app =
    typeof Env.APP_NAME === 'string' && Env.APP_NAME.trim() !== ''
      ? Env.APP_NAME
      : readEnvString('APP_NAME', '');
  if (app.trim() !== '') return toSafeDbBasename(app);

  return 'zintrust';
};

const resolveDefaultSqliteDatabasePath = (): string => {
  // Respect explicit sqlite *file path* configuration.
  // Note: we intentionally treat plain names like "zintrust" as placeholders, not file paths,
  // to avoid creating stray DB files in the project root.
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

const parseReadHosts = (raw: string): string[] | undefined => {
  const list = String(raw ?? '')
    .split(',')
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
  return list.length > 0 ? list : undefined;
};

const normalizeReadHosts = (
  primaryHost: string | undefined,
  hosts?: string[]
): string[] | undefined => {
  if (hosts === undefined || hosts.length === 0) return undefined;
  const primary = String(primaryHost ?? '').trim();
  const filtered = hosts.filter((host) => host !== '' && host !== primary);
  return filtered.length > 0 ? filtered : undefined;
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
    host: readWorkersFallbackString('WORKERS_PG_HOST', 'DB_HOST') || Env.DB_HOST,
    port: readWorkersFallbackInt('WORKERS_PG_PORT', 'DB_PORT_POSTGRESQL', Env.DB_PORT_POSTGRESQL),
    database:
      readWorkersFallbackString('WORKERS_PG_DATABASE', 'DB_DATABASE_POSTGRESQL') ||
      Env.DB_DATABASE_POSTGRESQL,
    username:
      readWorkersFallbackString('WORKERS_PG_USER', 'DB_USERNAME_POSTGRESQL') ||
      Env.DB_USERNAME_POSTGRESQL,
    password:
      readWorkersFallbackString('WORKERS_PG_PASSWORD', 'DB_PASSWORD_POSTGRESQL') ||
      Env.DB_PASSWORD_POSTGRESQL,
    ssl: Env.getBool('DB_SSL', false),
    readHosts: normalizeReadHosts(
      readWorkersFallbackString('WORKERS_PG_HOST', 'DB_HOST') || Env.DB_HOST,
      parseReadHosts(
        readWorkersFallbackString('WORKERS_PG_READ_HOSTS', 'DB_READ_HOSTS_POSTGRESQL') ||
          Env.DB_READ_HOSTS_POSTGRESQL
      )
    ),
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
    host: readWorkersFallbackString('WORKERS_MYSQL_HOST', 'DB_HOST') || Env.DB_HOST,
    port: readWorkersFallbackInt('WORKERS_MYSQL_PORT', 'DB_PORT', Env.DB_PORT),
    database: readWorkersFallbackString('WORKERS_MYSQL_DATABASE', 'DB_DATABASE') || Env.DB_DATABASE,
    username: readWorkersFallbackString('WORKERS_MYSQL_USER', 'DB_USERNAME') || Env.DB_USERNAME,
    password: readWorkersFallbackString('WORKERS_MYSQL_PASSWORD', 'DB_PASSWORD') || Env.DB_PASSWORD,
    readHosts: normalizeReadHosts(
      readWorkersFallbackString('WORKERS_MYSQL_HOST', 'DB_HOST') || Env.DB_HOST,
      parseReadHosts(
        readWorkersFallbackString('WORKERS_MYSQL_READ_HOSTS', 'DB_READ_HOSTS') || Env.DB_READ_HOSTS
      )
    ),
    pooling: {
      enabled: Env.getBool('DB_POOLING', true),
      min: Env.getInt('DB_POOL_MIN', 5),
      max: Env.getInt('DB_POOL_MAX', 20),
    },
  },
  sqlserver: {
    driver: 'sqlserver' as const,
    host: Env.DB_HOST_MSSQL,
    port: Env.DB_PORT_MSSQL,
    database: Env.DB_DATABASE_MSSQL,
    username: Env.DB_USERNAME_MSSQL,
    password: Env.DB_PASSWORD_MSSQL,
    readHosts: normalizeReadHosts(Env.DB_HOST_MSSQL, parseReadHosts(Env.DB_READ_HOSTS_MSSQL)),
  },
} satisfies DatabaseConnections;

const createDatabaseConfig = (): {
  default: string;
  connections: DatabaseConnections;
  getConnection: (this: DatabaseConfigShape) => DatabaseConnectionConfig;
  logging: { enabled: boolean; level: string };
  migrations: { directory: string; extension: string };
  seeders: { directory: string };
} => {
  const overrides: DatabaseConfigOverrides =
    StartupConfigFileRegistry.get<DatabaseConfigOverrides>(StartupConfigFile.Database) ?? {};

  const mergedConnections = {
    ...connections,
    ...overrides.connections,
  } satisfies DatabaseConnections;

  const baseLogging = {
    enabled: Env.getBool('DB_LOG_QUERIES', Env.DEBUG),
    level: Env.get('DB_LOG_LEVEL', 'debug'),
  };

  const baseMigrations = {
    directory: 'database/migrations',
    extension: Env.get('DB_MIGRATION_EXT', '.ts'),
  };

  const baseSeeders = {
    directory: 'database/seeders',
  };

  const mergedDefault =
    typeof overrides.default === 'string' && overrides.default.trim() !== ''
      ? overrides.default.trim()
      : getDefaultConnection(mergedConnections);

  const databaseConfigObj = {
    /**
     * Default database connection
     */
    default: mergedDefault,

    /**
     * Database connections
     */
    connections: mergedConnections,

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
      ...baseLogging,
      ...overrides.logging,
    },

    /**
     * Migration settings
     */
    migrations: {
      ...baseMigrations,
      ...overrides.migrations,
    },

    /**
     * Seeding settings
     */
    seeders: {
      ...baseSeeders,
      ...overrides.seeders,
    },
  };

  return Object.freeze(databaseConfigObj);
};

export type DatabaseConfig = ReturnType<typeof createDatabaseConfig>;

let cached: DatabaseConfig | null = null;
const proxyTarget: DatabaseConfig = {} as DatabaseConfig;

const ensureDatabaseConfig = (): DatabaseConfig => {
  if (cached) return cached;
  cached = createDatabaseConfig();

  try {
    Object.defineProperties(
      proxyTarget as unknown as object,
      Object.getOwnPropertyDescriptors(cached)
    );
  } catch {
    // best-effort
  }

  return cached;
};

export const databaseConfig: DatabaseConfig = new Proxy(proxyTarget, {
  get(_target, prop: keyof DatabaseConfig) {
    return ensureDatabaseConfig()[prop];
  },
  ownKeys() {
    ensureDatabaseConfig();
    return Reflect.ownKeys(proxyTarget as unknown as object);
  },
  getOwnPropertyDescriptor(_target, prop) {
    ensureDatabaseConfig();
    return Object.getOwnPropertyDescriptor(proxyTarget as unknown as object, prop);
  },
});
