/**
 * Configuration Exports
 * Central export point for all configuration
 */

import {
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
  CacheConfig,
  MicroservicesConfig,
  QueueConfig,
  StorageConfig,
} from '@zintrust/core';

// Core exports this as `DatabaseRuntimeConfig`; keep template API stable.
export type { DatabaseRuntimeConfig as DatabaseConfig } from '@zintrust/core';

export type BroadcastConfig = typeof broadcastConfig;
export type NotificationConfig = typeof notificationConfig;

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
