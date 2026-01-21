/**
 * Configuration Exports
 * Central export point for all configuration
 */

import { appConfig } from '@config/app';
import broadcastConfig from '@config/broadcast';
import { cacheConfig } from '@config/cache';
import { databaseConfig } from '@config/database';
import { microservicesConfig } from '@config/microservices';
import { middlewareConfig } from '@config/middleware';
import notificationConfig from '@config/notification';
import { queueConfig } from '@config/queue';
import { securityConfig } from '@config/security';
import { storageConfig } from '@config/storage';

export { appConfig, type AppConfig } from '@config/app';
export { default as broadcastConfig } from '@config/broadcast';
export { cacheConfig, type CacheConfig } from '@config/cache';
export { databaseConfig, type DatabaseConfig } from '@config/database';
export { microservicesConfig, type MicroservicesConfig } from '@config/microservices';
export { middlewareConfig } from '@config/middleware';
export { notificationConfig, type NotificationConfig } from '@config/notification';
export { queueConfig, type QueueConfig } from '@config/queue';
export { securityConfig } from '@config/security';
export { storageConfig, type StorageConfig } from '@config/storage';
export { createRedisConnection } from '@config/workers';

/**
 * Combined configuration object
 * Sealed namespace for immutability
 */
export const config = Object.freeze({
  app: appConfig,
  broadcast: broadcastConfig,
  database: databaseConfig,
  storage: storageConfig,
  notification: notificationConfig,
  security: securityConfig,
  middleware: middlewareConfig,
  microservices: microservicesConfig,
  cache: cacheConfig,
  queue: queueConfig,
} as const);

export type Config = typeof config;
