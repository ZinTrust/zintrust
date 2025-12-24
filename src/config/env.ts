/**
 * Environment Configuration
 * Type-safe access to environment variables
 *
 * Sealed namespace pattern - all exports through Env namespace
 */

import path from 'node:path';

// Private helper functions
const get = (key: string, defaultValue?: string): string => {
  return process.env[key] ?? defaultValue ?? '';
};

const getInt = (key: string, defaultValue?: number): number => {
  const value = process.env[key];
  if (value === undefined || value === null) return defaultValue ?? 0;
  return Number.parseInt(value, 10);
};

const getBool = (key: string, defaultValue?: boolean): boolean => {
  const value = process.env[key];
  if (value === undefined || value === null) return defaultValue ?? false;
  return value.toLowerCase() === 'true' || value === '1';
};

const getDefaultLogLevel = (): 'debug' | 'info' | 'warn' | 'error' => {
  const NODE_ENV_VALUE = get('NODE_ENV', 'development');
  if (NODE_ENV_VALUE === 'production') return 'info';
  if (NODE_ENV_VALUE === 'testing') return 'error';
  return 'debug';
};

// Sealed namespace with all environment configuration
export const Env = Object.freeze({
  // Helper functions
  get,
  getInt,
  getBool,

  // Core
  NODE_ENV: get('NODE_ENV', 'development'),
  PORT: getInt('PORT', 3000),
  HOST: get('HOST', 'localhost'),
  APP_NAME: get('APP_NAME', 'ZinTrust'),
  APP_KEY: get('APP_KEY', ''),

  // Database
  DB_CONNECTION: get('DB_CONNECTION', 'sqlite'),
  DB_HOST: get('DB_HOST', 'localhost'),
  DB_PORT: getInt('DB_PORT', 5432),
  DB_DATABASE: get('DB_DATABASE', 'zintrust'),
  DB_USERNAME: get('DB_USERNAME', 'postgres'),
  DB_PASSWORD: get('DB_PASSWORD', ''),
  DB_READ_HOSTS: get('DB_READ_HOSTS', ''),

  // Cloudflare
  D1_DATABASE_ID: get('D1_DATABASE_ID'),
  KV_NAMESPACE_ID: get('KV_NAMESPACE_ID'),

  // Cache
  CACHE_DRIVER: get('CACHE_DRIVER', 'memory'),
  REDIS_HOST: get('REDIS_HOST', 'localhost'),
  REDIS_PORT: getInt('REDIS_PORT', 6379),
  REDIS_PASSWORD: get('REDIS_PASSWORD', ''),
  MONGO_URI: get('MONGO_URI'),
  MONGO_DB: get('MONGO_DB', 'zintrust_cache'),

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

  // Deployment
  ENVIRONMENT: get('ENVIRONMENT', 'development'),
  REQUEST_TIMEOUT: getInt('REQUEST_TIMEOUT', 30000),
  MAX_BODY_SIZE: getInt('MAX_BODY_SIZE', 10485760),

  // Logging
  LOG_LEVEL: get('LOG_LEVEL', getDefaultLogLevel()) as 'debug' | 'info' | 'warn' | 'error',
  DISABLE_LOGGING: getBool('DISABLE_LOGGING', false),

  // Paths
  NODE_BIN_DIR: path.dirname(process.execPath),
  SAFE_PATH:
    process.platform === 'win32'
      ? [
          String.raw`C:\Windows\System32`,
          String.raw`C:\Windows`,
          path.dirname(process.execPath),
        ].join(';')
      : ['/usr/bin', '/bin', '/usr/sbin', '/sbin', path.dirname(process.execPath)].join(':'),
});
