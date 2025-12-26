/**
 * Application Configuration
 * Core application settings
 * Sealed namespace for immutability
 */

import { Env } from '@config/env';

type ProcessLike = { env?: Record<string, string | undefined> };

const getProcessLike = (): ProcessLike | undefined => {
  return typeof process === 'undefined' ? undefined : (process as unknown as ProcessLike);
};

const readEnvString = (key: string, defaultValue: string = ''): string => {
  const anyEnv = Env as unknown as { get?: unknown };
  if (typeof anyEnv.get === 'function') {
    return (anyEnv.get as (k: string, d?: string) => string)(key, defaultValue);
  }

  const proc = getProcessLike();
  const raw = proc?.env?.[key];
  return raw ?? defaultValue;
};

const readEnvInt = (key: string, defaultValue: number): number => {
  const anyEnv = Env as unknown as { getInt?: unknown };
  if (typeof anyEnv.getInt === 'function') {
    return (anyEnv.getInt as (k: string, d?: number) => number)(key, defaultValue);
  }

  const raw = readEnvString(key, String(defaultValue));
  const parsed = Number.parseInt(raw, 10);
  return Number.isNaN(parsed) ? defaultValue : parsed;
};

const readEnvBool = (key: string, defaultValue: boolean): boolean => {
  const anyEnv = Env as unknown as { getBool?: unknown };
  if (typeof anyEnv.getBool === 'function') {
    return (anyEnv.getBool as (k: string, d?: boolean) => boolean)(key, defaultValue);
  }

  const raw = readEnvString(key, defaultValue ? 'true' : 'false');
  return raw.toLowerCase() === 'true' || raw === '1';
};

const getSafeEnv = (): NodeJS.ProcessEnv => {
  const baseEnv: Partial<NodeJS.ProcessEnv> = typeof process === 'undefined' ? {} : process.env;

  return {
    ...(baseEnv as NodeJS.ProcessEnv),

    // Ensure required keys exist (env.d.ts augments ProcessEnv with required fields)
    NODE_ENV:
      baseEnv.NODE_ENV ??
      (readEnvString('NODE_ENV', 'development') as NodeJS.ProcessEnv['NODE_ENV']),
    USE_RAW_QRY: baseEnv.USE_RAW_QRY ?? (readEnvString('USE_RAW_QRY', '') || undefined),
    SERVICE_API_KEY: baseEnv.SERVICE_API_KEY ?? readEnvString('SERVICE_API_KEY', ''),
    SERVICE_JWT_SECRET: baseEnv.SERVICE_JWT_SECRET ?? readEnvString('SERVICE_JWT_SECRET', ''),
    BASE_URL: baseEnv.BASE_URL ?? readEnvString('BASE_URL', ''),
    MODE: baseEnv.MODE ?? readEnvString('MODE', ''),

    // Hardening for child-process usage
    PATH:
      typeof (Env as unknown as { SAFE_PATH?: unknown }).SAFE_PATH === 'string'
        ? (Env as unknown as { SAFE_PATH: string }).SAFE_PATH
        : (baseEnv['PATH'] ?? ''),
    npm_config_scripts_prepend_node_path: 'true',
  };
};

const appConfigObj = {
  /**
   * Application name
   */
  name:
    typeof (Env as unknown as { APP_NAME?: unknown }).APP_NAME === 'string'
      ? (Env as unknown as { APP_NAME: string }).APP_NAME
      : readEnvString('APP_NAME', 'ZinTrust'),

  /**
   * Application environment
   */
  environment: (typeof (Env as unknown as { NODE_ENV?: unknown }).NODE_ENV === 'string'
    ? (Env as unknown as { NODE_ENV: string }).NODE_ENV
    : readEnvString('NODE_ENV', 'development')) as 'development' | 'production' | 'testing',

  /**
   * Application port
   */
  port:
    typeof (Env as unknown as { PORT?: unknown }).PORT === 'number'
      ? (Env as unknown as { PORT: number }).PORT
      : readEnvInt('APP_PORT', 3000),

  /**
   * Application host
   */
  host:
    typeof (Env as unknown as { HOST?: unknown }).HOST === 'string'
      ? (Env as unknown as { HOST: string }).HOST
      : readEnvString('HOST', 'localhost'),

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
  debug:
    typeof (Env as unknown as { DEBUG?: unknown }).DEBUG === 'boolean'
      ? (Env as unknown as { DEBUG: boolean }).DEBUG
      : readEnvBool('DEBUG', false),

  /**
   * Application timezone
   */
  timezone: readEnvString('APP_TIMEZONE', 'UTC'),

  /**
   * Request timeout (milliseconds)
   */
  requestTimeout: readEnvInt('REQUEST_TIMEOUT', 30000),

  /**
   * Max request body size
   */
  maxBodySize: readEnvString('MAX_BODY_SIZE', '10mb'),

  getSafeEnv,
} as const;

export const appConfig = Object.freeze(appConfigObj);
export { getSafeEnv };

export type AppConfig = typeof appConfig;
