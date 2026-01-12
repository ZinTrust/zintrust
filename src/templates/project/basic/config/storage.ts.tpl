/**
 * Storage Configuration (template)
 *
 * Keep this file declarative:
 * - Core owns env parsing/default logic.
 * - Projects can override values by editing `drivers` and `storageConfigObj`.
 */

import { storageConfig as coreStorageConfig } from '@zintrust/core';

type StorageConfigShape = typeof coreStorageConfig;

export const drivers = {
  ...coreStorageConfig.drivers,
} satisfies StorageConfigShape['drivers'];

export const storageConfigObj = {
  ...coreStorageConfig,
  drivers,
} satisfies StorageConfigShape;

export const storageConfig = storageConfigObj;
export type StorageConfig = typeof storageConfig;
