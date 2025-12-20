/**
 * Configuration Exports
 * Central export point for all configuration
 */

import { appConfig } from '@config/app';
import { cacheConfig } from '@config/cache';
import { databaseConfig } from '@config/database';
import { microservicesConfig } from '@config/microservices';
import { queueConfig } from '@config/queue';
import { securityConfig } from '@config/security';
import { storageConfig } from '@config/storage';

export { appConfig, type AppConfig } from '@config/app';
export { cacheConfig, type CacheConfig } from '@config/cache';
export { databaseConfig, type DatabaseConfig } from '@config/database';
export { microservicesConfig, type MicroservicesConfig } from '@config/microservices';
export { queueConfig, type QueueConfig } from '@config/queue';
export { securityConfig } from '@config/security';
export { storageConfig, type StorageConfig } from '@config/storage';

/**
 * Combined configuration object
 */
export const config = {
  app: appConfig,
  database: databaseConfig,
  storage: storageConfig,
  security: securityConfig,
  microservices: microservicesConfig,
  cache: cacheConfig,
  queue: queueConfig,
} as const;

export type Config = typeof config;
