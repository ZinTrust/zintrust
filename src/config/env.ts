/**
 * Environment Configuration
 * Type-safe access to environment variables
 *
 * Sealed namespace pattern - all exports through Env namespace
 * Safe for both Node.js and serverless runtimes (Cloudflare Workers, Deno, Lambda)
 */

import type { ProcessLike } from '@config/type';

export type EnvSource = Record<string, unknown> | (() => Record<string, unknown>);

// Cache process check once at module load time
const processLike: ProcessLike | undefined =
  typeof process === 'undefined' ? undefined : (process as unknown as ProcessLike);

let externalEnvSource: EnvSource | null = null;

const getEnvSource = (): Record<string, unknown> => {
  if (typeof externalEnvSource === 'function') return externalEnvSource();
  if (externalEnvSource !== null) return externalEnvSource;
  return processLike?.env ?? {};
};

const normalizeEnvValue = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  return '';
};

export const getProcessLike = (): ProcessLike | undefined => processLike;

export const dirnameFromExecPath = (execPath: string, platform?: string): string => {
  const separator = platform === 'win32' ? '\\' : '/';
  const lastSep = execPath.lastIndexOf(separator);
  if (lastSep <= 0) return '';
  return execPath.slice(0, lastSep);
};

// Private helper functions
export const get = (key: string, defaultValue?: string): string => {
  const env = getEnvSource();
  const value = normalizeEnvValue(env[key]);
  return value === '' ? (defaultValue ?? '') : value;
};

export const getInt = (key: string, defaultValue: number): number => {
  const value = get(key, String(defaultValue ?? 0));
  if (value.trim() === '') return defaultValue ?? 0;
  return Number.parseInt(value, 10);
};

export const getFloat = (key: string, defaultValue?: number): number => {
  const value = get(key, String(defaultValue ?? 0));
  if (value.trim() === '') return defaultValue ?? 0;
  return Number.parseFloat(value);
};

export const getBool = (key: string, defaultValue?: boolean): boolean => {
  const value = get(key, defaultValue === true ? 'true' : 'false');
  if (value.trim() === '') return defaultValue ?? false;
  return value.toLowerCase() === 'true' || value === '1';
};

export const set = (key: string, value: string): void => {
  if (processLike?.env === undefined) return;
  processLike.env[key] = value;
};

export const unset = (key: string): void => {
  if (processLike?.env === undefined) return;
  // Use Reflect.deleteProperty to avoid deleting dynamically computed property keys
  Reflect.deleteProperty(processLike.env, key);
};

export const setSource = (source: EnvSource | null): void => {
  externalEnvSource = source;
};

export const getDefaultLogLevel = (): 'debug' | 'info' | 'warn' | 'error' => {
  const NODE_ENV_VALUE = get('NODE_ENV', 'development');
  if (NODE_ENV_VALUE === 'production') return 'info';
  if (NODE_ENV_VALUE === 'testing') return 'error';
  return 'debug';
};
export const ZT_PROXY_TIMEOUT_MS = getInt('ZT_PROXY_TIMEOUT_MS', 30000);

// Sealed namespace with all environment configuration
export const Env = Object.freeze({
  // Helper functions
  get,
  getInt,
  getBool,
  getFloat,
  set,
  unset,
  setSource,

  // Core
  NODE_ENV: get('NODE_ENV', 'development') as NodeJS.ProcessEnv['NODE_ENV'],
  // Prefer PORT, fallback to APP_PORT for compatibility
  PORT: getInt('PORT', getInt('APP_PORT', 3000)),
  HOST: get('HOST', 'localhost'),
  BASE_URL: get('BASE_URL', ''),
  APP_NAME: get('APP_NAME', 'ZinTrust'),
  APP_KEY: get('APP_KEY', ''),
  // Optional key rotation support (comma-separated or JSON array of keys)
  APP_PREVIOUS_KEYS: get('APP_PREVIOUS_KEYS', ''),

  // Database
  DB_CONNECTION: get('DB_CONNECTION', 'sqlite'),
  DB_HOST: get('DB_HOST', 'localhost'),
  DB_PORT: getInt('DB_PORT', 5432),
  // Accept DB_PATH as an alias for sqlite file path (many env templates use it).
  DB_DATABASE: get('DB_DATABASE', get('DB_PATH', 'zintrust')),
  DB_USERNAME: get('DB_USERNAME', 'postgres'),
  DB_PASSWORD: get('DB_PASSWORD', ''),
  DB_READ_HOSTS: get('DB_READ_HOSTS', ''),
  // PostgreSQL-specific configuration (with _POSTGRESQL suffix to avoid conflicts with MySQL)
  DB_PORT_POSTGRESQL: getInt('DB_PORT_POSTGRESQL', 5432),
  DB_DATABASE_POSTGRESQL: get('DB_DATABASE_POSTGRESQL', 'postgres'),
  DB_USERNAME_POSTGRESQL: get('DB_USERNAME_POSTGRESQL', 'postgres'),
  DB_PASSWORD_POSTGRESQL: get('DB_PASSWORD_POSTGRESQL', ''),
  DB_READ_HOSTS_POSTGRESQL: get('DB_READ_HOSTS_POSTGRESQL', ''),

  // SQL Server (MSSQL) specific configuration
  DB_HOST_MSSQL: get('DB_HOST_MSSQL', get('DB_HOST', 'localhost')),
  DB_PORT_MSSQL: getInt('DB_PORT_MSSQL', 1433),
  DB_DATABASE_MSSQL: get('DB_DATABASE_MSSQL', 'zintrust'),
  DB_USERNAME_MSSQL: get('DB_USERNAME_MSSQL', 'sa'),
  DB_PASSWORD_MSSQL: get('DB_PASSWORD_MSSQL', ''),
  DB_READ_HOSTS_MSSQL: get('DB_READ_HOSTS_MSSQL', ''),

  // Cloudflare
  D1_DATABASE_ID: get('D1_DATABASE_ID'),
  KV_NAMESPACE_ID: get('KV_NAMESPACE_ID'),

  // Cloudflare proxy services (D1/KV outside Cloudflare)
  D1_REMOTE_URL: get('D1_REMOTE_URL', ''),
  D1_REMOTE_KEY_ID: get('D1_REMOTE_KEY_ID', ''),
  D1_REMOTE_SECRET: get('D1_REMOTE_SECRET', ''),
  D1_REMOTE_MODE: get('D1_REMOTE_MODE', 'registry'),

  MYSQL_PROXY_URL: get('MYSQL_PROXY_URL', ''),
  MYSQL_PROXY_HOST: get('MYSQL_PROXY_HOST', '127.0.0.1'),
  MYSQL_PROXY_PORT: getInt('MYSQL_PROXY_PORT', 8789),
  MYSQL_PROXY_MAX_BODY_BYTES: getInt('MYSQL_PROXY_MAX_BODY_BYTES', 131072),
  MYSQL_PROXY_POOL_LIMIT: getInt('MYSQL_PROXY_POOL_LIMIT', 10),
  MYSQL_PROXY_KEY_ID: get('MYSQL_PROXY_KEY_ID', ''),
  MYSQL_PROXY_SECRET: get('MYSQL_PROXY_SECRET', ''),
  MYSQL_PROXY_TIMEOUT_MS: getInt('MYSQL_PROXY_TIMEOUT_MS', ZT_PROXY_TIMEOUT_MS),
  MYSQL_PROXY_REQUIRE_SIGNING: getBool('MYSQL_PROXY_REQUIRE_SIGNING', true),
  MYSQL_PROXY_SIGNING_WINDOW_MS: getInt(
    'MYSQL_PROXY_SIGNING_WINDOW_MS',
    getInt('ZT_PROXY_SIGNING_WINDOW_MS', 60000)
  ),

  POSTGRES_PROXY_URL: get('POSTGRES_PROXY_URL', ''),
  POSTGRES_PROXY_HOST: get('POSTGRES_PROXY_HOST', '127.0.0.1'),
  POSTGRES_PROXY_PORT: getInt('POSTGRES_PROXY_PORT', 8790),
  POSTGRES_PROXY_MAX_BODY_BYTES: getInt('POSTGRES_PROXY_MAX_BODY_BYTES', 131072),
  POSTGRES_PROXY_POOL_LIMIT: getInt('POSTGRES_PROXY_POOL_LIMIT', 10),
  POSTGRES_PROXY_KEY_ID: get('POSTGRES_PROXY_KEY_ID', ''),
  POSTGRES_PROXY_SECRET: get('POSTGRES_PROXY_SECRET', ''),
  POSTGRES_PROXY_TIMEOUT_MS: getInt('POSTGRES_PROXY_TIMEOUT_MS', ZT_PROXY_TIMEOUT_MS),
  POSTGRES_PROXY_REQUIRE_SIGNING: getBool('POSTGRES_PROXY_REQUIRE_SIGNING', true),
  POSTGRES_PROXY_SIGNING_WINDOW_MS: getInt(
    'POSTGRES_PROXY_SIGNING_WINDOW_MS',
    getInt('ZT_PROXY_SIGNING_WINDOW_MS', 60000)
  ),

  REDIS_PROXY_URL: get('REDIS_PROXY_URL', ''),
  REDIS_PROXY_HOST: get('REDIS_PROXY_HOST', '127.0.0.1'),
  REDIS_PROXY_PORT: getInt('REDIS_PROXY_PORT', 8791),
  REDIS_PROXY_MAX_BODY_BYTES: getInt('REDIS_PROXY_MAX_BODY_BYTES', 131072),
  REDIS_PROXY_KEY_ID: get('REDIS_PROXY_KEY_ID', ''),
  REDIS_PROXY_SECRET: get('REDIS_PROXY_SECRET', ''),
  REDIS_PROXY_TIMEOUT_MS: getInt('REDIS_PROXY_TIMEOUT_MS', ZT_PROXY_TIMEOUT_MS),
  REDIS_PROXY_REQUIRE_SIGNING: getBool('REDIS_PROXY_REQUIRE_SIGNING', true),
  REDIS_PROXY_SIGNING_WINDOW_MS: getInt(
    'REDIS_PROXY_SIGNING_WINDOW_MS',
    getInt('ZT_PROXY_SIGNING_WINDOW_MS', 60000)
  ),
  USE_REDIS_PROXY: getBool('USE_REDIS_PROXY', false),

  MONGODB_PROXY_URL: get('MONGODB_PROXY_URL', ''),
  MONGODB_PROXY_HOST: get('MONGODB_PROXY_HOST', '127.0.0.1'),
  MONGODB_PROXY_PORT: getInt('MONGODB_PROXY_PORT', 8792),
  MONGODB_PROXY_MAX_BODY_BYTES: getInt('MONGODB_PROXY_MAX_BODY_BYTES', 131072),
  MONGODB_PROXY_KEY_ID: get('MONGODB_PROXY_KEY_ID', ''),
  MONGODB_PROXY_SECRET: get('MONGODB_PROXY_SECRET', ''),
  MONGODB_PROXY_TIMEOUT_MS: getInt('MONGODB_PROXY_TIMEOUT_MS', ZT_PROXY_TIMEOUT_MS),
  MONGODB_PROXY_REQUIRE_SIGNING: getBool('MONGODB_PROXY_REQUIRE_SIGNING', true),
  MONGODB_PROXY_SIGNING_WINDOW_MS: getInt(
    'MONGODB_PROXY_SIGNING_WINDOW_MS',
    getInt('ZT_PROXY_SIGNING_WINDOW_MS', 60000)
  ),
  USE_MONGODB_PROXY: getBool('USE_MONGODB_PROXY', false),

  SQLSERVER_PROXY_URL: get('SQLSERVER_PROXY_URL', ''),
  SQLSERVER_PROXY_HOST: get('SQLSERVER_PROXY_HOST', '127.0.0.1'),
  SQLSERVER_PROXY_PORT: getInt('SQLSERVER_PROXY_PORT', 8793),
  SQLSERVER_PROXY_MAX_BODY_BYTES: getInt('SQLSERVER_PROXY_MAX_BODY_BYTES', 131072),
  SQLSERVER_PROXY_POOL_LIMIT: getInt('SQLSERVER_PROXY_POOL_LIMIT', 10),
  SQLSERVER_PROXY_KEY_ID: get('SQLSERVER_PROXY_KEY_ID', ''),
  SQLSERVER_PROXY_SECRET: get('SQLSERVER_PROXY_SECRET', ''),
  SQLSERVER_PROXY_TIMEOUT_MS: getInt('SQLSERVER_PROXY_TIMEOUT_MS', ZT_PROXY_TIMEOUT_MS),
  SQLSERVER_PROXY_REQUIRE_SIGNING: getBool('SQLSERVER_PROXY_REQUIRE_SIGNING', true),
  SQLSERVER_PROXY_SIGNING_WINDOW_MS: getInt(
    'SQLSERVER_PROXY_SIGNING_WINDOW_MS',
    getInt('ZT_PROXY_SIGNING_WINDOW_MS', 60000)
  ),
  USE_SQLSERVER_PROXY: getBool('USE_SQLSERVER_PROXY', false),

  KV_REMOTE_URL: get('KV_REMOTE_URL', ''),
  KV_REMOTE_KEY_ID: get('KV_REMOTE_KEY_ID', ''),
  KV_REMOTE_SECRET: get('KV_REMOTE_SECRET', ''),
  KV_REMOTE_NAMESPACE: get('KV_REMOTE_NAMESPACE', ''),

  // Proxy client tuning
  ZT_PROXY_SIGNING_WINDOW_MS: getInt('ZT_PROXY_SIGNING_WINDOW_MS', 60000),
  ZT_PROXY_TIMEOUT_MS: getInt('ZT_PROXY_TIMEOUT_MS', 30000),

  // Cache
  CACHE_DRIVER: get('CACHE_DRIVER', 'memory'),
  REDIS_HOST: get('REDIS_HOST', 'localhost'),
  REDIS_PORT: getInt('REDIS_PORT', 6379),
  REDIS_PASSWORD: get('REDIS_PASSWORD', ''),
  REDIS_DB: getInt('REDIS_DB', 0),
  REDIS_URL: get('REDIS_URL', ''),
  MONGO_URI: get('MONGO_URI'),
  MONGO_DB: get('MONGO_DB', 'zintrust_cache'),

  // Queue
  QUEUE_CONNECTION: get('QUEUE_CONNECTION', ''),
  QUEUE_DRIVER: get('QUEUE_DRIVER', ''),

  // Rate Limiting
  RATE_LIMIT_STORE: get('RATE_LIMIT_STORE', ''),
  RATE_LIMIT_DRIVER: get('RATE_LIMIT_DRIVER', ''),
  RATE_LIMIT_KEY_PREFIX: get('RATE_LIMIT_KEY_PREFIX', 'zintrust:ratelimit:'),

  // Notifications
  NOTIFICATION_DRIVER: get('NOTIFICATION_DRIVER', ''),
  TERMII_API_KEY: get('TERMII_API_KEY', ''),
  TERMII_SENDER: get('TERMII_SENDER', 'ZinTrust'),

  // AWS
  AWS_REGION: get('AWS_REGION', 'us-east-1'),
  AWS_LAMBDA_FUNCTION_NAME: get('AWS_LAMBDA_FUNCTION_NAME'),
  AWS_LAMBDA_FUNCTION_VERSION: get('AWS_LAMBDA_FUNCTION_VERSION'),
  AWS_EXECUTION_ENV: get('AWS_EXECUTION_ENV'),
  LAMBDA_TASK_ROOT: get('LAMBDA_TASK_ROOT'),

  // Microservices
  MICROSERVICES: get('MICROSERVICES'),
  SERVICES: get('SERVICES'),
  MICROSERVICES_TRACING: getBool('MICROSERVICES_TRACING'),
  MICROSERVICES_TRACING_RATE: Number.parseFloat(get('MICROSERVICES_TRACING_RATE', '1.0')),
  DATABASE_ISOLATION: get('DATABASE_ISOLATION', 'shared'),
  SERVICE_API_KEY: get('SERVICE_API_KEY'),
  SERVICE_JWT_SECRET: get('SERVICE_JWT_SECRET'),

  // Security
  DEBUG: getBool('DEBUG', false),
  ENABLE_MICROSERVICES: getBool('ENABLE_MICROSERVICES', false),
  TOKEN_TTL: getInt('TOKEN_TTL', 3600000),
  TOKEN_LENGTH: getInt('TOKEN_LENGTH', 32),
  CSRF_STORE: get('CSRF_STORE', ''),
  CSRF_DRIVER: get('CSRF_DRIVER', ''),
  CSRF_REDIS_DB: getInt('CSRF_REDIS_DB', 1),

  // Encryption interop
  ENCRYPTION_CIPHER: get('ENCRYPTION_CIPHER', ''),

  // Deployment
  ENVIRONMENT: get('ENVIRONMENT', 'development'),
  REQUEST_TIMEOUT: getInt('REQUEST_TIMEOUT', 30000),
  APP_TIMEZONE: get('APP_TIMEZONE', 'UTC'),
  MAX_BODY_SIZE: getInt('MAX_BODY_SIZE', 10485760),
  SHUTDOWN_TIMEOUT: getInt('SHUTDOWN_TIMEOUT', 10000),

  // SSE
  SSE_HEARTBEAT_INTERVAL: getInt('SSE_HEARTBEAT_INTERVAL', 15000),
  SSE_SNAPSHOT_INTERVAL: getInt('SSE_SNAPSHOT_INTERVAL', 5000),

  // Logging
  LOG_LEVEL: get('LOG_LEVEL', getDefaultLogLevel()) as 'debug' | 'info' | 'warn' | 'error',
  LOG_FORMAT: get('LOG_FORMAT', 'text'),
  LOG_CHANNEL: get('LOG_CHANNEL', ''),
  DISABLE_LOGGING: getBool('DISABLE_LOGGING', false),
  LOG_HTTP_REQUEST: getBool('LOG_HTTP_REQUEST', false),
  LOG_TO_FILE: getBool('LOG_TO_FILE', false),
  LOG_ROTATION_SIZE: getInt('LOG_ROTATION_SIZE', 10485760),
  LOG_ROTATION_DAYS: getInt('LOG_ROTATION_DAYS', 7),

  // zintrust-specific
  ZINTRUST_PROJECT_ROOT: get('ZINTRUST_PROJECT_ROOT', ''),
  ZINTRUST_ALLOW_POSTINSTALL: get('ZINTRUST_ALLOW_POSTINSTALL', ''),
  ZINTRUST_ENV_FILE: get('ZINTRUST_ENV_FILE', '.env.pull'),
  ZINTRUST_SECRETS_MANIFEST: get('ZINTRUST_SECRETS_MANIFEST', 'secrets.manifest.json'),
  ZINTRUST_ENV_IN_FILE: get('ZINTRUST_ENV_IN_FILE', '.env'),
  ZINTRUST_SECRETS_PROVIDER: get('ZINTRUST_SECRETS_PROVIDER', ''),
  ZINTRUST_ALLOW_AUTO_INSTALL: get('ZINTRUST_ALLOW_AUTO_INSTALL', ''),

  // Cloudflare Credentials
  CLOUDFLARE_ACCOUNT_ID: get('CLOUDFLARE_ACCOUNT_ID', ''),
  CLOUDFLARE_API_TOKEN: get('CLOUDFLARE_API_TOKEN', ''),
  CLOUDFLARE_KV_NAMESPACE_ID: get('CLOUDFLARE_KV_NAMESPACE_ID', ''),

  // AWS Credentials (additional)
  AWS_DEFAULT_REGION: get('AWS_DEFAULT_REGION', ''),
  AWS_ACCESS_KEY_ID: get('AWS_ACCESS_KEY_ID', ''),
  AWS_SECRET_ACCESS_KEY: get('AWS_SECRET_ACCESS_KEY', ''),
  AWS_SESSION_TOKEN: get('AWS_SESSION_TOKEN', ''),

  // CI/CD
  CI: get('CI', ''),

  // System paths
  HOME: get('HOME', ''),
  USERPROFILE: get('USERPROFILE', ''),

  // Template/Misc
  TEMPLATE_COPYRIGHT: get('TEMPLATE_COPYRIGHT', '© 2025 ZinTrust Framework. All rights reserved.'),
  SERVICE_NAME: get('SERVICE_NAME', ''),
  APP_MODE: get('APP_MODE', get('NODE_ENV', 'development')),
  APP_PORT: getInt('APP_PORT', 3000),
  RUNTIME: get('RUNTIME', ''),

  // Paths (safely constructed for Node.js environments)
  NODE_BIN_DIR: (() => {
    try {
      if (processLike?.execPath === null || processLike?.execPath === undefined) return '';
      return dirnameFromExecPath(processLike.execPath, processLike.platform);
    } catch {
      // Fallback for non-Node environments
      return '';
    }
  })(),
  SAFE_PATH: (() => {
    try {
      if (processLike?.execPath === null || processLike?.execPath === undefined) return '';

      const binDir = dirnameFromExecPath(processLike.execPath, processLike.platform);
      if (processLike.platform === 'win32') {
        return [String.raw`C:\Windows\System32`, String.raw`C:\Windows`, binDir].join(';');
      }
      return ['/usr/bin', '/bin', '/usr/sbin', '/sbin', binDir].join(':');
    } catch {
      // Fallback for non-Node environments
      return '';
    }
  })(),
});

export const buildRedisUrl = (): string => {
  const raw = get('REDIS_URL', '').trim();
  if (raw !== '') return raw;

  const host = get('REDIS_HOST', 'localhost');
  const port = getInt('REDIS_PORT', 6379);
  const password = get('REDIS_PASSWORD', '');
  const db = getInt('REDIS_QUEUE_DB', 0);

  let url = 'redis://';
  if (password.trim() !== '') url += `:${encodeURIComponent(password)}@`;
  url += `${host}:${port}`;
  if (db > 0) url += `/${db}`;
  return url;
};
