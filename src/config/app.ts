/**
 * Application Configuration
 * Core application settings
 */

import { Env } from '@config/env';

export const appConfig = {
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
} as const;

export type AppConfig = typeof appConfig;
