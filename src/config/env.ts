/**
 * Environment Configuration
 * Type-safe access to environment variables
 *
 * Sealed namespace pattern - all exports through Env namespace
 * Safe for both Node.js and serverless runtimes (Cloudflare Workers, Deno, Lambda)
 */

import type { ProcessLike } from '@config/type';
import { isArray, isNonEmptyString, isObject } from '@helper/index';

export type EnvSource = Record<string, unknown> | (() => Record<string, unknown>);
export type ResolvedEnvState = {
  values: Record<string, string>;
  sources: Record<string, string>;
  packedEnabled: boolean;
  packedKeys: string[];
};

// Cache process check once at module load time
const processLike: ProcessLike | undefined =
  typeof process === 'undefined' ? undefined : (process as unknown as ProcessLike);

let externalEnvSource: EnvSource | null = null;
const DIRECT_ENV_SOURCE = 'direct-env';
const PACKED_ENV_ENABLE_KEY = 'USE_PACK';
const PACKED_ENV_KEYS_KEY = 'PACK_KEYS';
const APP_TIMEZONE_KEY = 'APP_TIMEZONE';
const TIME_ZONE_ALIAS_KEY = 'TIME_ZONE';
const PACKED_ENV_CONTROL_KEYS = new Set([PACKED_ENV_ENABLE_KEY, PACKED_ENV_KEYS_KEY]);

const createPackedEnvError = (message: string, details?: unknown): Error => {
  const error = Object.create(globalThis.Error.prototype) as Error & {
    code?: string;
    statusCode?: number;
    details?: unknown;
    name?: string;
    message?: string;
  };

  error.name = 'ConfigError';
  error.message = message;
  error.code = 'CONFIG_ERROR';
  error.statusCode = 500;
  if (details !== undefined) {
    error.details = details;
  }

  return error;
};

const getGlobalEnv = (): Record<string, unknown> | undefined => {
  const env = (globalThis as { env?: unknown }).env;
  if (env === undefined || env === null || typeof env !== 'object') return undefined;
  return env as Record<string, unknown>;
};

const getRawEnvSource = (): Record<string, unknown> => {
  if (typeof externalEnvSource === 'function') return externalEnvSource();
  if (externalEnvSource !== null) return externalEnvSource;

  const globalEnv = getGlobalEnv();
  if (globalEnv !== undefined) {
    return {
      ...processLike?.env,
      ...globalEnv,
    };
  }

  return processLike?.env ?? {};
};

const normalizePackedScalar = (packName: string, key: string, value: unknown): string => {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }

  throw createPackedEnvError(
    `${packName} contains unsupported value for ${key}. Expected a flat string-compatible value.`
  );
};

const normalizeEnvValue = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  return '';
};

const isDirectEnvScalar = (
  value: unknown
): value is string | number | boolean | bigint | null | undefined => {
  return (
    value === null ||
    value === undefined ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  );
};

const parsePackedEnvKeys = (
  env: Record<string, unknown>
): { enabled: boolean; packKeys: string[] } => {
  const enabled = normalizeEnvValue(env[PACKED_ENV_ENABLE_KEY]).trim().toLowerCase() === 'true';
  if (!enabled) {
    return { enabled: false, packKeys: [] };
  }

  const raw = normalizeEnvValue(env[PACKED_ENV_KEYS_KEY]);
  const packKeys = raw
    .split(',')
    .map((item) => item.trim())
    .filter((item, index, items) => item !== '' && items.indexOf(item) === index);

  if (packKeys.length === 0) {
    throw createPackedEnvError('USE_PACK is true but PACK_KEYS is empty');
  }

  return { enabled: true, packKeys };
};

const parsePackedPayload = (packName: string, payload: unknown): Record<string, unknown> => {
  if (!isNonEmptyString(normalizeEnvValue(payload))) {
    throw createPackedEnvError(`PACK_KEYS contains ${packName} but env.${packName} is missing`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(normalizeEnvValue(payload)) as unknown;
  } catch (error) {
    throw createPackedEnvError(`${packName} did not parse as a JSON object`, error);
  }

  if (!isObject(parsed) || isArray(parsed)) {
    throw createPackedEnvError(`${packName} did not parse as a JSON object`);
  }

  return parsed;
};

const applyPackedPayload = (
  values: Record<string, string>,
  sources: Record<string, string>,
  packName: string,
  payload: Record<string, unknown>
): void => {
  for (const [rawKey, rawValue] of Object.entries(payload)) {
    const key = rawKey.trim();
    if (!isNonEmptyString(key)) continue;
    if (PACKED_ENV_CONTROL_KEYS.has(key)) continue;
    if (isObject(rawValue) || isArray(rawValue) || rawValue === null || rawValue === undefined) {
      throw createPackedEnvError(
        `${packName} contains unsupported value for ${key}. Nested or null values are not supported.`
      );
    }

    values[key] = normalizePackedScalar(packName, key, rawValue);
    sources[key] = packName;
  }
};

const overlayDirectEnvValues = (
  values: Record<string, string>,
  sources: Record<string, string>,
  env: Record<string, unknown>
): void => {
  for (const [key, rawValue] of Object.entries(env)) {
    if (!isDirectEnvScalar(rawValue)) continue;
    values[key] = normalizeEnvValue(rawValue);
    sources[key] = DIRECT_ENV_SOURCE;
  }
};

const resolvePackedEnvState = (env: Record<string, unknown>): ResolvedEnvState => {
  const values: Record<string, string> = {};
  const sources: Record<string, string> = {};
  const { enabled, packKeys } = parsePackedEnvKeys(env);

  if (enabled) {
    for (const packName of packKeys) {
      applyPackedPayload(values, sources, packName, parsePackedPayload(packName, env[packName]));
    }
  }

  overlayDirectEnvValues(values, sources, env);

  return {
    values,
    sources,
    packedEnabled: enabled,
    packedKeys: packKeys,
  };
};

const getResolvedEnvState = (): ResolvedEnvState => resolvePackedEnvState(getRawEnvSource());

const getEnvSource = (): Record<string, unknown> => getResolvedEnvState().values;

const getResolvedEnvEntry = (
  key: string,
  env: Record<string, unknown>
): { value: string; resolvedKey?: string } => {
  const directValue = normalizeEnvValue(env[key]);
  if (directValue !== '') {
    return { value: directValue, resolvedKey: key };
  }

  if (key === APP_TIMEZONE_KEY) {
    const aliasValue = normalizeEnvValue(env[TIME_ZONE_ALIAS_KEY]);
    if (aliasValue !== '') {
      return { value: aliasValue, resolvedKey: TIME_ZONE_ALIAS_KEY };
    }
  }

  return { value: '' };
};

const isValidTimeZone = (value: string): boolean => {
  try {
    Intl.DateTimeFormat('en-US', { timeZone: value }).resolvedOptions();
    return true;
  } catch {
    return false;
  }
};

export const getProcessLike = (): ProcessLike | undefined => processLike;

export const dirnameFromExecPath = (execPath: string, platform?: string): string => {
  const separator = platform === 'win32' ? '\\' : '/';
  const lastSep = execPath.lastIndexOf(separator);
  if (lastSep <= 0) return '';
  return execPath.slice(0, lastSep);
};

export const getOptional = (key: string): string | undefined => {
  const env = getEnvSource();
  const resolved = getResolvedEnvEntry(key, env);
  if (resolved.resolvedKey === undefined) return undefined;
  return resolved.value;
};

export const has = (key: string): boolean => {
  const env = getEnvSource();
  return getResolvedEnvEntry(key, env).resolvedKey !== undefined;
};

export const getSourceOf = (key: string): string | undefined => {
  const resolvedState = getResolvedEnvState();
  const resolved = getResolvedEnvEntry(key, resolvedState.values);
  if (resolved.resolvedKey === undefined) return undefined;
  return resolvedState.sources[resolved.resolvedKey];
};

export const snapshotSources = (): Record<string, string> => {
  return { ...getResolvedEnvState().sources };
};

export const getResolvedState = (): ResolvedEnvState => getResolvedEnvState();

// Private helper functions
export const get = (key: string, defaultValue?: string): string => {
  const env = getEnvSource();
  const value = getResolvedEnvEntry(key, env).value;
  return value === '' ? (defaultValue ?? '') : value;
};

export const resolveAppTimezone = (): string => {
  const raw = get(APP_TIMEZONE_KEY, 'UTC').trim();
  if (isNonEmptyString(raw)) {
    return isValidTimeZone(raw) ? raw : 'UTC';
  }
  return 'UTC';
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

export const snapshot = (): Record<string, string> => {
  const env = getEnvSource();
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    out[key] = normalizeEnvValue(value);
  }
  return out;
};

export const getDefaultLogLevel = (): 'debug' | 'info' | 'warn' | 'error' => {
  const NODE_ENV_VALUE = get('NODE_ENV', 'development');
  if (NODE_ENV_VALUE === 'production') return 'info';
  if (NODE_ENV_VALUE === 'testing') return 'error';
  return 'debug';
};
export const ZT_PROXY_TIMEOUT_MS = getInt('ZT_PROXY_TIMEOUT_MS', 30000);
const PROXY_KEY_ID_FALLBACK = get('APP_NAME', 'ZinTrust');
const PROXY_SECRET_FALLBACK = get('APP_KEY', '');

// Sealed namespace with all environment configuration
export const Env = Object.freeze({
  // Helper functions
  get,
  getOptional,
  getInt,
  getBool,
  getFloat,
  has,
  set,
  unset,
  setSource,
  snapshot,
  getSourceOf,
  snapshotSources,
  getResolvedState,

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
  D1_REMOTE_KEY_ID: get('D1_REMOTE_KEY_ID', PROXY_KEY_ID_FALLBACK),
  D1_REMOTE_SECRET: get('D1_REMOTE_SECRET', PROXY_SECRET_FALLBACK),
  D1_REMOTE_MODE: get('D1_REMOTE_MODE', 'registry'),

  MYSQL_PROXY_URL: get('MYSQL_PROXY_URL', ''),
  MYSQL_PROXY_HOST: get('MYSQL_PROXY_HOST', '127.0.0.1'),
  MYSQL_PROXY_PORT: getInt('MYSQL_PROXY_PORT', 8789),
  MYSQL_PROXY_MAX_BODY_BYTES: getInt('MYSQL_PROXY_MAX_BODY_BYTES', 131072),
  MYSQL_PROXY_POOL_LIMIT: getInt('MYSQL_PROXY_POOL_LIMIT', 10),
  MYSQL_PROXY_KEY_ID: get('MYSQL_PROXY_KEY_ID', PROXY_KEY_ID_FALLBACK),
  MYSQL_PROXY_SECRET: get('MYSQL_PROXY_SECRET', PROXY_SECRET_FALLBACK),
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
  POSTGRES_PROXY_KEY_ID: get('POSTGRES_PROXY_KEY_ID', PROXY_KEY_ID_FALLBACK),
  POSTGRES_PROXY_SECRET: get('POSTGRES_PROXY_SECRET', PROXY_SECRET_FALLBACK),
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
  REDIS_PROXY_KEY_ID: get('REDIS_PROXY_KEY_ID', PROXY_KEY_ID_FALLBACK),
  REDIS_PROXY_SECRET: get('REDIS_PROXY_SECRET', PROXY_SECRET_FALLBACK),
  REDIS_PROXY_TIMEOUT_MS: getInt('REDIS_PROXY_TIMEOUT_MS', ZT_PROXY_TIMEOUT_MS),
  REDIS_PROXY_REQUIRE_SIGNING: getBool('REDIS_PROXY_REQUIRE_SIGNING', true),
  REDIS_PROXY_SIGNING_WINDOW_MS: getInt(
    'REDIS_PROXY_SIGNING_WINDOW_MS',
    getInt('ZT_PROXY_SIGNING_WINDOW_MS', 60000)
  ),
  USE_REDIS_PROXY: getBool('USE_REDIS_PROXY', false),

  SMTP_PROXY_URL: get('SMTP_PROXY_URL', ''),
  SMTP_PROXY_HOST: get('SMTP_PROXY_HOST', '127.0.0.1'),
  SMTP_PROXY_PORT: getInt('SMTP_PROXY_PORT', 8794),
  SMTP_PROXY_MAX_BODY_BYTES: getInt('SMTP_PROXY_MAX_BODY_BYTES', 131072),
  SMTP_PROXY_KEY_ID: get('SMTP_PROXY_KEY_ID', PROXY_KEY_ID_FALLBACK),
  SMTP_PROXY_SECRET: get('SMTP_PROXY_SECRET', PROXY_SECRET_FALLBACK),
  SMTP_PROXY_TIMEOUT_MS: getInt('SMTP_PROXY_TIMEOUT_MS', ZT_PROXY_TIMEOUT_MS),
  SMTP_PROXY_REQUIRE_SIGNING: getBool('SMTP_PROXY_REQUIRE_SIGNING', true),
  SMTP_PROXY_SIGNING_WINDOW_MS: getInt(
    'SMTP_PROXY_SIGNING_WINDOW_MS',
    getInt('ZT_PROXY_SIGNING_WINDOW_MS', 60000)
  ),
  USE_SMTP_PROXY: getBool('USE_SMTP_PROXY', false),

  // Mail
  MAIL_DRIVER: get('MAIL_DRIVER', 'disabled'),
  MAIL_CONNECTION: get('MAIL_CONNECTION', ''),
  MAIL_FROM_ADDRESS: get('MAIL_FROM_ADDRESS', ''),
  MAIL_FROM_NAME: get('MAIL_FROM_NAME', ''),
  MAIL_CLOUDFLARE_BINDING: get('MAIL_CLOUDFLARE_BINDING', get('MAIL_CL_BINDING', 'SEND_EMAIL')),
  MAIL_CLOUDFLARE_PROXY_URL: get('MAIL_CLOUDFLARE_PROXY_URL', ''),
  MAIL_CLOUDFLARE_PROXY_KEY_ID: get('MAIL_CLOUDFLARE_PROXY_KEY_ID', PROXY_KEY_ID_FALLBACK),
  MAIL_CLOUDFLARE_PROXY_SECRET: get('MAIL_CLOUDFLARE_PROXY_SECRET', PROXY_SECRET_FALLBACK),
  MAIL_CLOUDFLARE_PROXY_TIMEOUT_MS: getInt(
    'MAIL_CLOUDFLARE_PROXY_TIMEOUT_MS',
    ZT_PROXY_TIMEOUT_MS
  ),
  MAIL_HOST: get('MAIL_HOST', ''),
  MAIL_PORT: getInt('MAIL_PORT', 587),
  MAIL_USERNAME: get('MAIL_USERNAME', ''),
  MAIL_PASSWORD: get('MAIL_PASSWORD', ''),
  MAIL_SECURE: get('MAIL_SECURE', ''),
  SENDGRID_API_KEY: get('SENDGRID_API_KEY', ''),
  MAILGUN_API_KEY: get('MAILGUN_API_KEY', ''),
  MAILGUN_DOMAIN: get('MAILGUN_DOMAIN', ''),
  MAILGUN_BASE_URL: get('MAILGUN_BASE_URL', 'https://api.mailgun.net'),

  MONGODB_PROXY_URL: get('MONGODB_PROXY_URL', ''),
  MONGODB_PROXY_HOST: get('MONGODB_PROXY_HOST', '127.0.0.1'),
  MONGODB_PROXY_PORT: getInt('MONGODB_PROXY_PORT', 8792),
  MONGODB_PROXY_MAX_BODY_BYTES: getInt('MONGODB_PROXY_MAX_BODY_BYTES', 131072),
  MONGODB_PROXY_KEY_ID: get('MONGODB_PROXY_KEY_ID', PROXY_KEY_ID_FALLBACK),
  MONGODB_PROXY_SECRET: get('MONGODB_PROXY_SECRET', PROXY_SECRET_FALLBACK),
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
  SQLSERVER_PROXY_KEY_ID: get('SQLSERVER_PROXY_KEY_ID', PROXY_KEY_ID_FALLBACK),
  SQLSERVER_PROXY_SECRET: get('SQLSERVER_PROXY_SECRET', PROXY_SECRET_FALLBACK),
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
  QUEUE_HTTP_PROXY_ENABLED: getBool('QUEUE_HTTP_PROXY_ENABLED', false),
  QUEUE_HTTP_PROXY_GATEWAY_ENABLED: getBool('QUEUE_HTTP_PROXY_GATEWAY_ENABLED', true),
  QUEUE_HTTP_PROXY_URL: get('QUEUE_HTTP_PROXY_URL', ''),
  QUEUE_HTTP_PROXY_PATH: get('QUEUE_HTTP_PROXY_PATH', '/api/_sys/queue/rpc'),
  QUEUE_HTTP_PROXY_KEY_ID: get('QUEUE_HTTP_PROXY_KEY_ID', PROXY_KEY_ID_FALLBACK),
  QUEUE_HTTP_PROXY_KEY: get('QUEUE_HTTP_PROXY_KEY', PROXY_SECRET_FALLBACK),
  QUEUE_HTTP_PROXY_TIMEOUT_MS: getInt('QUEUE_HTTP_PROXY_TIMEOUT_MS', ZT_PROXY_TIMEOUT_MS),
  QUEUE_HTTP_PROXY_MAX_SKEW_MS: getInt(
    'QUEUE_HTTP_PROXY_MAX_SKEW_MS',
    getInt('ZT_PROXY_SIGNING_WINDOW_MS', 60000)
  ),
  QUEUE_HTTP_PROXY_NONCE_TTL_MS: getInt('QUEUE_HTTP_PROXY_NONCE_TTL_MS', 120000),
  QUEUE_HTTP_PROXY_MIDDLEWARE: get('QUEUE_HTTP_PROXY_MIDDLEWARE', ''),

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

  // JWT revocation (token invalidation)
  JWT_REVOCATION_DRIVER: get('JWT_REVOCATION_DRIVER', 'database'),
  JWT_REVOCATION_DB_CONNECTION: get('JWT_REVOCATION_DB_CONNECTION', 'default'),
  JWT_REVOCATION_DB_TABLE: get('JWT_REVOCATION_DB_TABLE', 'zintrust_jwt_revocations'),
  BULLETPROOF_DEVICE_DB_CONNECTION: get('BULLETPROOF_DEVICE_DB_CONNECTION', 'default'),
  BULLETPROOF_DEVICE_DB_TABLE: get('BULLETPROOF_DEVICE_DB_TABLE', 'zintrust_bulletproof_devices'),
  JWT_REVOCATION_REDIS_DB: getInt('JWT_REVOCATION_REDIS_DB', 0),
  JWT_REVOCATION_REDIS_PREFIX: get('JWT_REVOCATION_REDIS_PREFIX', 'zt:jwt:revoked:'),
  JWT_REVOCATION_KV_BINDING: get('JWT_REVOCATION_KV_BINDING', 'CACHE'),
  JWT_REVOCATION_KV_PREFIX: get('JWT_REVOCATION_KV_PREFIX', 'zt:jwt:revoked:'),

  // Encryption interop
  ENCRYPTION_CIPHER: get('ENCRYPTION_CIPHER', ''),

  // Deployment
  ENVIRONMENT: get('ENVIRONMENT', 'development'),
  REQUEST_TIMEOUT: getInt('REQUEST_TIMEOUT', 30000),
  APP_TIMEZONE: get(APP_TIMEZONE_KEY, 'UTC'),
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
  LOG_HTTP_REQUEST: getBool('LOG_HTTP_REQUEST', true),
  LOG_TO_FILE: getBool('LOG_TO_FILE', false),
  LOG_ROTATION_SIZE: getInt('LOG_ROTATION_SIZE', 10485760),
  LOG_ROTATION_DAYS: getInt('LOG_ROTATION_DAYS', 7),

  // Worker-specific
  CLOUDFLARE_WORKER: getBool('CLOUDFLARE_WORKER', false),
  WORKER_ENABLED: getBool('WORKER_ENABLED', false),
  DOCKER_WORKER: getBool('DOCKER_WORKER', false),

  // zintrust-specific
  ZINTRUST_PROJECT_ROOT: get('ZINTRUST_PROJECT_ROOT', ''),
  ZINTRUST_ALLOW_POSTINSTALL: get('ZINTRUST_ALLOW_POSTINSTALL', ''),
  ZINTRUST_ENV_FILE: get('ZINTRUST_ENV_FILE', '.env.pull'),
  ZINTRUST_SECRETS_MANIFEST: get('ZINTRUST_SECRETS_MANIFEST', 'secrets.manifest.json'),
  ZINTRUST_ENV_IN_FILE: get('ZINTRUST_ENV_IN_FILE', '.env'),
  ZINTRUST_SECRETS_PROVIDER: get('ZINTRUST_SECRETS_PROVIDER', ''),
  ZINTRUST_ALLOW_AUTO_INSTALL: get('ZINTRUST_ALLOW_AUTO_INSTALL', ''),
  WORKER_SHUTDOWN_ON_APP_EXIT: getBool('WORKER_SHUTDOWN_ON_APP_EXIT', true),

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
  TEMPLATE_COPYRIGHT: get(
    'TEMPLATE_COPYRIGHT',
    `© ${new Date().getFullYear()} ZinTrust Framework. All rights reserved.`
  ),
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
      return [
        '/opt/homebrew/bin',
        '/usr/local/bin',
        '/usr/bin',
        '/bin',
        '/usr/sbin',
        '/sbin',
        binDir,
      ].join(':');
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
