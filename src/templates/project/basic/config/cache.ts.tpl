/**
 * Cache Configuration (template)
 *
 * Keep this file declarative:
 * - Core owns env parsing/default logic.
 * - Projects can override values by editing `drivers` and `cacheConfigObj`.
 */

import { cacheConfig as coreCacheConfig } from '@zintrust/core';

type CacheConfigShape = typeof coreCacheConfig;

export const drivers = {
  ...coreCacheConfig.drivers,
} satisfies CacheConfigShape['drivers'];

export const cacheConfigObj = {
  ...coreCacheConfig,
  drivers,
} satisfies CacheConfigShape;

export const cacheConfig = cacheConfigObj;
export type CacheConfig = typeof cacheConfig;
