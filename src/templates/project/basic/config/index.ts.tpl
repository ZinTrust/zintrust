/**
 * Configuration Exports
 * Central export point for all configuration
 */

import { appConfig } from './app';
import { cacheConfig } from './cache';
import { databaseConfig } from './database';
import { microservicesConfig } from './microservices';
import { middlewareConfig } from './middleware';
import { queueConfig } from './queue';
import { securityConfig } from './security';
import { storageConfig } from './storage';

export { appConfig, type AppConfig } from './app';
export { cacheConfig, type CacheConfig } from './cache';
export { databaseConfig, type DatabaseConfig } from './database';
export { microservicesConfig, type MicroservicesConfig } from './microservices';
export { middlewareConfig } from './middleware';
export { queueConfig, type QueueConfig } from './queue';
export { securityConfig } from './security';
export { storageConfig, type StorageConfig } from './storage';

/**
 * Combined configuration object
 * Sealed namespace for immutability
 */
export const config = Object.freeze({
  app: appConfig,
  database: databaseConfig,
  storage: storageConfig,
  security: securityConfig,
  middleware: middlewareConfig,
  microservices: microservicesConfig,
  cache: cacheConfig,
  queue: queueConfig,
} as const);

export type Config = typeof config;
