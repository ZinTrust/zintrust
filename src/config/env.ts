/**
 * Environment Configuration
 * Type-safe access to environment variables
 */

/**
 * Get environment variable with type safety
 */
export function get(key: string, defaultValue?: string): string {
  return process.env[key] ?? defaultValue ?? '';
}

/**
 * Get numeric environment variable
 */
export function getInt(key: string, defaultValue?: number): number {
  const value = process.env[key];
  if (value == null) return defaultValue ?? 0;
  return Number.parseInt(value, 10);
}

/**
 * Get boolean environment variable
 */
export function getBool(key: string, defaultValue?: boolean): boolean {
  const value = process.env[key];
  if (value == null) return defaultValue ?? false;
  return value.toLowerCase() === 'true' || value === '1';
}

// Common environment variables
export const NODE_ENV = get('NODE_ENV', 'development');
export const PORT = getInt('PORT', 3000);
export const HOST = get('HOST', 'localhost');
export const APP_NAME = get('APP_NAME', 'ZinTrust');

// Database
export const DB_CONNECTION = get('DB_CONNECTION', 'sqlite');
export const DB_HOST = get('DB_HOST', 'localhost');
export const DB_PORT = getInt('DB_PORT', 5432);
export const DB_DATABASE = get('DB_DATABASE', 'zintrust');
export const DB_USERNAME = get('DB_USERNAME', 'postgres');
export const DB_PASSWORD = get('DB_PASSWORD', '');
export const DB_READ_HOSTS = get('DB_READ_HOSTS', '');

// Cloudflare
export const D1_DATABASE_ID = get('D1_DATABASE_ID');
export const KV_NAMESPACE_ID = get('KV_NAMESPACE_ID');

// Cache
export const CACHE_DRIVER = get('CACHE_DRIVER', 'memory');
export const REDIS_HOST = get('REDIS_HOST', 'localhost');
export const REDIS_PORT = getInt('REDIS_PORT', 6379);
export const REDIS_PASSWORD = get('REDIS_PASSWORD', '');
export const MONGO_URI = get('MONGO_URI');
export const MONGO_DB = get('MONGO_DB', 'zintrust_cache');

// AWS
export const AWS_REGION = get('AWS_REGION', 'us-east-1');
export const AWS_LAMBDA_FUNCTION_NAME = get('AWS_LAMBDA_FUNCTION_NAME');
export const AWS_LAMBDA_FUNCTION_VERSION = get('AWS_LAMBDA_FUNCTION_VERSION');
export const AWS_EXECUTION_ENV = get('AWS_EXECUTION_ENV');
export const LAMBDA_TASK_ROOT = get('LAMBDA_TASK_ROOT');

// Microservices
export const MICROSERVICES = get('MICROSERVICES');
export const SERVICES = get('SERVICES');
export const MICROSERVICES_TRACING = getBool('MICROSERVICES_TRACING');
export const MICROSERVICES_TRACING_RATE = Number.parseFloat(
  get('MICROSERVICES_TRACING_RATE', '1.0')
);
export const DATABASE_ISOLATION = get('DATABASE_ISOLATION', 'shared');
export const SERVICE_API_KEY = get('SERVICE_API_KEY');
export const SERVICE_JWT_SECRET = get('SERVICE_JWT_SECRET');

// Security
export const DEBUG = getBool('DEBUG', false);
export const ENABLE_MICROSERVICES = getBool('ENABLE_MICROSERVICES', false);

// Deployment
export const ENVIRONMENT = get('ENVIRONMENT', 'development');
export const REQUEST_TIMEOUT = getInt('REQUEST_TIMEOUT', 30000);
export const MAX_BODY_SIZE = getInt('MAX_BODY_SIZE', 10485760); // 10MB

// Logging
export const LOG_LEVEL = get('LOG_LEVEL', 'debug') as 'debug' | 'info' | 'warn' | 'error';
export const DISABLE_LOGGING = getBool('DISABLE_LOGGING', false);

/**
 * Env object for backward compatibility
 */
export const Env = {
  get,
  getInt,
  getBool,
  NODE_ENV,
  PORT,
  HOST,
  APP_NAME,
  DB_CONNECTION,
  DB_HOST,
  DB_PORT,
  DB_DATABASE,
  DB_USERNAME,
  DB_PASSWORD,
  DB_READ_HOSTS,
  D1_DATABASE_ID,
  KV_NAMESPACE_ID,
  CACHE_DRIVER,
  REDIS_HOST,
  REDIS_PORT,
  REDIS_PASSWORD,
  MONGO_URI,
  MONGO_DB,
  AWS_REGION,
  AWS_LAMBDA_FUNCTION_NAME,
  AWS_LAMBDA_FUNCTION_VERSION,
  AWS_EXECUTION_ENV,
  LAMBDA_TASK_ROOT,
  MICROSERVICES,
  SERVICES,
  MICROSERVICES_TRACING,
  MICROSERVICES_TRACING_RATE,
  DATABASE_ISOLATION,
  SERVICE_API_KEY,
  SERVICE_JWT_SECRET,
  DEBUG,
  ENABLE_MICROSERVICES,
  ENVIRONMENT,
  REQUEST_TIMEOUT,
  MAX_BODY_SIZE,
  LOG_LEVEL,
  DISABLE_LOGGING,
};
