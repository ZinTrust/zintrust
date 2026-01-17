/**
 * Application Configuration
 * Core application settings
 * Sealed namespace for immutability
 */

import { Env } from '@config/env';
import type { Environment, StartMode } from '@config/type';

// Cache getSafeEnv result at module load time to avoid repeated object creation
const cachedSafeEnv: NodeJS.ProcessEnv = {
  // Ensure required keys exist (env.d.ts augments ProcessEnv with required fields)
  NODE_ENV: Env.NODE_ENV,
  MODE: Env.NODE_ENV,
  USE_RAW_QRY: Env.get('USE_RAW_QRY') || undefined,
  SERVICE_API_KEY: Env.SERVICE_API_KEY,
  SERVICE_JWT_SECRET: Env.SERVICE_JWT_SECRET || Env.APP_KEY,
  BASE_URL: Env.BASE_URL,
  // Hardening for child-process usage
  PATH: Env.SAFE_PATH,
  npm_config_scripts_prepend_node_path: 'true',
};

const getSafeEnv = (): NodeJS.ProcessEnv => cachedSafeEnv;

const normalizeMode = (): StartMode => {
  const value = Env.NODE_ENV as Environment;
  if (value === 'production' || value === 'pro' || value === 'prod') return 'production';
  if (value === 'testing' || value === 'test') return 'testing';
  return 'development';
};

const appConfigObj = {
  /**
   * Application name
   */
  name: Env.APP_NAME,

  /**
   * Application environment
   */
  environment: normalizeMode(),

  /**
   * Application port
   */
  port: Env.PORT,

  /**
   * Application host
   */
  host: Env.HOST,

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
  debug: Env.DEBUG,

  /**
   * Application timezone
   */
  timezone: Env.APP_TIMEZONE,

  /**
   * Request timeout (milliseconds)
   */
  requestTimeout: Env.REQUEST_TIMEOUT,

  /**
   * Max request body size
   */
  maxBodySize: Env.MAX_BODY_SIZE,

  getSafeEnv,
} as const;

export const appConfig = Object.freeze(appConfigObj);
export { getSafeEnv };

export type AppConfig = typeof appConfig;
