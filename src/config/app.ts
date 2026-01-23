/**
 * Application Configuration
 * Core application settings
 * Sealed namespace for immutability
 */

import { Env } from '@config/env';
import type { Environment, StartMode } from '@config/type';

// Cache getSafeEnv result at module load time to avoid repeated object creation
const anyEnv = Env as {
  get?: (key: string, defaultValue?: string) => string;
  getInt?: (key: string, defaultValue?: number) => number;
  getBool?: (key: string, defaultValue?: boolean) => boolean;
};

const readEnvString = (key: string, defaultValue: string = ''): string => {
  if (typeof anyEnv.get === 'function') {
    return anyEnv.get(key, defaultValue) ?? '';
  }

  if (typeof process !== 'undefined') {
    const raw = process.env?.[key];
    if (typeof raw === 'string' && raw !== '') return raw;
  }

  return defaultValue;
};

const readEnvInt = (key: string, defaultValue: number = 0): number => {
  if (typeof anyEnv.getInt === 'function') {
    return anyEnv.getInt(key, defaultValue);
  }

  const raw = readEnvString(key, String(defaultValue));
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : defaultValue;
};

const readEnvBool = (key: string, defaultValue: boolean = false): boolean => {
  if (typeof anyEnv.getBool === 'function') {
    return anyEnv.getBool(key, defaultValue);
  }

  const raw = readEnvString(key, '');
  if (raw === '') return defaultValue;
  return raw.toLowerCase() === 'true' || raw === '1';
};

const readAppPort = (): number => {
  if (typeof anyEnv.getInt === 'function') {
    return anyEnv.getInt('PORT', anyEnv.getInt('APP_PORT', 3000));
  }

  if (typeof Env.PORT === 'number' && Number.isFinite(Env.PORT) && Env.PORT > 0) {
    return Env.PORT;
  }

  const portRaw = readEnvString('PORT', readEnvString('APP_PORT', '3000'));
  const parsed = Number.parseInt(portRaw, 10);
  return Number.isFinite(parsed) ? parsed : 3000;
};

/**
 * Check if running on AWS Lambda
 */
function isLambda(): boolean {
  return (
    Env.getBool('LAMBDA_TASK_ROOT') === true ||
    Env.getBool('AWS_LAMBDA_FUNCTION_NAME') === true ||
    Env.getBool('AWS_EXECUTION_ENV') === true
  );
}

/**
 * Check if running on Cloudflare Workers
 */
function isCloudflare(): boolean {
  return (globalThis as unknown as { CF: unknown }).CF !== undefined;
}

/**
 * Check if running on Deno
 */
function isDeno(): boolean {
  return (globalThis as unknown as { Deno: unknown }).Deno !== undefined;
}

/**
 * Detect current runtime environment
 */
const detectRuntime = (): string => {
  const explicit = Env.get('RUNTIME').trim();

  if (explicit !== '' && explicit !== 'auto') return explicit;

  // Auto-detection logic
  if (isLambda() === true) {
    return 'lambda';
  }

  if (isCloudflare() === true) {
    return 'cloudflare';
  }

  if (isDeno() === true) {
    return 'deno';
  }

  // Default to nodejs for containers (Fargate, Docker, Cloud Run)
  return 'nodejs';
};

const resolvedNodeEnv = readEnvString('NODE_ENV', 'development') as NodeJS.ProcessEnv['NODE_ENV'];

// Cache getSafeEnv result at module load time to avoid repeated object creation
const cachedSafeEnv: NodeJS.ProcessEnv = {
  ...(typeof process === 'undefined' ? {} : process.env),
  NODE_ENV: resolvedNodeEnv,
  MODE: resolvedNodeEnv,
  npm_config_scripts_prepend_node_path: 'true',
};

const useRawQry = readEnvString('USE_RAW_QRY');
if (useRawQry !== '') cachedSafeEnv.USE_RAW_QRY = useRawQry;

const serviceApiKey = readEnvString('SERVICE_API_KEY');
if (serviceApiKey !== '') cachedSafeEnv.SERVICE_API_KEY = serviceApiKey;

const serviceJwtSecret = readEnvString('SERVICE_JWT_SECRET') || readEnvString('APP_KEY');
if (serviceJwtSecret !== '') cachedSafeEnv.SERVICE_JWT_SECRET = serviceJwtSecret;

const baseUrl = readEnvString('BASE_URL');
if (baseUrl !== '') cachedSafeEnv['BASE_URL'] = baseUrl;

if (typeof Env.SAFE_PATH === 'string' && Env.SAFE_PATH !== '') {
  cachedSafeEnv['PATH'] = Env.SAFE_PATH;
}

const getSafeEnv = (): NodeJS.ProcessEnv => cachedSafeEnv;

const normalizeMode = (): StartMode => {
  const value = readEnvString('NODE_ENV', Env.NODE_ENV ?? 'development') as Environment;
  if (value === 'production' || value === 'pro' || value === 'prod') return 'production';
  if (value === 'testing' || value === 'test') return 'testing';
  return 'development';
};

const Prefix = (): string => {
  const app_name = (Env.APP_NAME || 'zintrust').toLowerCase().replaceAll(/\s/g, '-');
  const env = Env.NODE_ENV;
  return `${app_name}-zintrust-${env}`;
};

const appConfigObj = {
  /**
   * Application name
   */
  name: readEnvString('APP_NAME', Env.APP_NAME),

  /**
   * Application prefix
   */
  prefix: Prefix(),

  /**
   * Application environment
   */
  environment: normalizeMode(),

  /**
   * Application port
   */
  port: readAppPort(),

  /**
   * Application host
   */
  host: readEnvString('HOST', Env.HOST),

  /**
   * Is development environment
   */
  isDevelopment(): boolean {
    return this.environment === 'development';
  },

  /**
   * Is production environment
   */
  isProduction(): boolean {
    return this.environment === 'production';
  },

  /**
   * Is testing environment
   */
  isTesting(): boolean {
    return this.environment === 'testing';
  },

  /**
   * Application debug mode
   */
  debug: readEnvBool('DEBUG', Env.DEBUG),

  /**
   * Application timezone
   */
  timezone: readEnvString('APP_TIMEZONE', Env.APP_TIMEZONE),

  /**
   * Request timeout (milliseconds)
   */
  requestTimeout: readEnvInt('REQUEST_TIMEOUT', Env.REQUEST_TIMEOUT),

  /**
   * Max request body size
   */
  maxBodySize: readEnvInt('MAX_BODY_SIZE', Env.MAX_BODY_SIZE),

  getSafeEnv,
  detectRuntime,
} as const;

export const appConfig = Object.freeze(appConfigObj);
export { getSafeEnv };

export type AppConfig = typeof appConfig;
