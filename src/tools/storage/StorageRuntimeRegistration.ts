import type { StorageConfigRuntime, StorageDriverConfig } from '@config/type';
import { ErrorFactory } from '@exceptions/ZintrustError';
import { StorageDiskRegistry } from '@storage/StorageDiskRegistry';

export type StorageRuntimeConfig = StorageConfigRuntime & {
  getDriverConfig?: (name?: string) => StorageDriverConfig;
};

export function registerDisksFromRuntimeConfig(config: StorageRuntimeConfig): void {
  for (const [name, driverConfig] of Object.entries(config.drivers)) {
    StorageDiskRegistry.register(name, driverConfig);
  }

  // Alias reserved name `default` to the configured default.
  const defaultName = String(config.default ?? '').trim();
  if (defaultName.length === 0) {
    throw ErrorFactory.createConfigError('Storage default disk is not configured');
  }

  const resolvedDefault = config.drivers[defaultName];
  if (resolvedDefault === undefined) {
    throw ErrorFactory.createConfigError(`Storage default disk not configured: ${defaultName}`);
  }

  StorageDiskRegistry.register('default', resolvedDefault);
}

export const StorageRuntimeRegistration = Object.freeze({
  registerDisksFromRuntimeConfig,
});

export default StorageRuntimeRegistration;
