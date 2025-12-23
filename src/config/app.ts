/**
 * Application Configuration
 * Core application settings
 * Sealed namespace for immutability
 */

import { Env } from '@config/env';

const getSafeEnv = (): NodeJS.ProcessEnv => {
  return {
    ...process.env,
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
  environment: Env.NODE_ENV as 'development' | 'production' | 'testing',

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
