import type { StorageConfigRuntime, StorageDriverConfig } from '@config/type';
import { StorageDiskRegistry } from '@storage/StorageDiskRegistry';

export type StorageRuntimeConfig = StorageConfigRuntime & {
  getDriverConfig?: (name?: string) => StorageDriverConfig;
};

export function registerDisksFromRuntimeConfig(config: StorageRuntimeConfig): void {
  for (const [name, driverConfig] of Object.entries(config.drivers)) {
    StorageDiskRegistry.register(name, driverConfig);
  }

  // Alias reserved name `default` to the configured default.
  // Prefer config.getDriverConfig() so we preserve its fallback semantics.
  let resolvedDefault: StorageDriverConfig | undefined;

  if (typeof config.getDriverConfig === 'function') {
    resolvedDefault = config.getDriverConfig('default');
  } else {
    const values = Object.values(config.drivers);
    resolvedDefault = config.drivers[config.default] ?? values[0];
  }

  if (resolvedDefault !== undefined) {
    StorageDiskRegistry.register('default', resolvedDefault);
  }
}

export const StorageRuntimeRegistration = Object.freeze({
  registerDisksFromRuntimeConfig,
});

export default StorageRuntimeRegistration;
