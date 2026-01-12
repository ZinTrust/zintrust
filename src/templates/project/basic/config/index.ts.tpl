/**
 * Configuration Exports (template)
 * Central export point for all configuration
 */

export {
  appConfig,
  broadcastConfig,
  cacheConfig,
  databaseConfig,
  microservicesConfig,
  middlewareConfig,
  notificationConfig,
  queueConfig,
  securityConfig,
  storageConfig,
} from '@zintrust/core';

export type {
  AppConfig,
  BroadcastConfig,
  CacheConfig,
  DatabaseConfig,
  MicroservicesConfig,
  MiddlewareConfig,
  NotificationConfig,
  QueueConfig,
  SecurityConfig,
  StorageConfig,
} from '@zintrust/core';

/**
 * Combined configuration object
 */
export const config = {
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
} as const;

export type Config = typeof config;
