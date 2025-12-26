/**
 * Application Configuration
 * Core application settings
 * Sealed namespace for immutability
 */

import { Env } from '@config/env';

const getSafeEnv = (): NodeJS.ProcessEnv => {
  const baseEnv: Partial<NodeJS.ProcessEnv> = typeof process === 'undefined' ? {} : process.env;

  return {
    ...(baseEnv as NodeJS.ProcessEnv),

    // Ensure required keys exist (env.d.ts augments ProcessEnv with required fields)
    NODE_ENV: baseEnv.NODE_ENV ?? (Env.NODE_ENV as NodeJS.ProcessEnv['NODE_ENV']),
    USE_RAW_QRY: baseEnv.USE_RAW_QRY ?? (Env.get('USE_RAW_QRY') || undefined),
    SERVICE_API_KEY: baseEnv.SERVICE_API_KEY ?? Env.get('SERVICE_API_KEY', ''),
    SERVICE_JWT_SECRET: baseEnv.SERVICE_JWT_SECRET ?? Env.get('SERVICE_JWT_SECRET', ''),
    BASE_URL: baseEnv.BASE_URL ?? Env.get('BASE_URL', ''),
    MODE: baseEnv.MODE ?? Env.get('MODE', ''),

    // Hardening for child-process usage
    PATH: Env.SAFE_PATH,
    npm_config_scripts_prepend_node_path: 'true',
  };
};

const appConfigObj = {
  /**
   * Application name
   */
  name: Env.APP_NAME,

  /**
   * Application environment
   */
  environment: Env.NODE_ENV as
    | 'development'
    | 'production'
    | 'testing'
    | 'dev'
    | 'prod'
    | undefined,

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
    return (
      this.environment === 'development' ||
      this.environment === 'dev' ||
      this.environment === undefined ||
      this.environment === null
    );
  },

  /**
   * Is production environment
   */
  isProduction(): boolean {
    return this.environment === 'production' || this.environment === 'prod';
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
  timezone: Env.get('APP_TIMEZONE', 'UTC'),

  /**
   * Request timeout (milliseconds)
   */
  requestTimeout: Env.getInt('REQUEST_TIMEOUT', 30000),

  /**
   * Max request body size
   */
  maxBodySize: Env.get('MAX_BODY_SIZE', '10mb'),

  getSafeEnv,
} as const;

export const appConfig = Object.freeze(appConfigObj);
export { getSafeEnv };

export type AppConfig = typeof appConfig;
