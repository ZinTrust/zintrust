# index config

- Source: `src/config/index.ts`

## Usage

Import from the framework:

```ts
import { index } from '@zintrust/core';

// Example (if supported by the module):
// index.*
```

## Snapshot (top)

```ts
/**
 * Configuration Exports
 * Central export point for all configuration
 */

import {
  appConfig,
  cacheConfig,
  databaseConfig,
  microservicesConfig,
  middlewareConfig,
  queueConfig,
  securityConfig,
  storageConfig,
} from '@zintrust/core';

export { appConfig, type AppConfig } from '@zintrust/core';
export { cacheConfig, type CacheConfig } from '@zintrust/core';
export { databaseConfig } from '@zintrust/core';
export type { DatabaseRuntimeConfig as DatabaseConfig } from '@zintrust/core';
export { microservicesConfig, type MicroservicesConfig } from '@zintrust/core';
export { middlewareConfig } from '@zintrust/core';
export { queueConfig, type QueueConfig } from '@zintrust/core';
export { securityConfig } from '@zintrust/core';
export { storageConfig, type StorageConfig } from '@zintrust/core';

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
```

## Snapshot (bottom)

```ts
/**
 * Configuration Exports
 * Central export point for all configuration
 */

import {
  appConfig,
  cacheConfig,
  databaseConfig,
  microservicesConfig,
  middlewareConfig,
  queueConfig,
  securityConfig,
  storageConfig,
} from '@zintrust/core';

export { appConfig, type AppConfig } from '@zintrust/core';
export { cacheConfig, type CacheConfig } from '@zintrust/core';
export { databaseConfig } from '@zintrust/core';
export type { DatabaseRuntimeConfig as DatabaseConfig } from '@zintrust/core';
export { microservicesConfig, type MicroservicesConfig } from '@zintrust/core';
export { middlewareConfig } from '@zintrust/core';
export { queueConfig, type QueueConfig } from '@zintrust/core';
export { securityConfig } from '@zintrust/core';
export { storageConfig, type StorageConfig } from '@zintrust/core';

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
```
