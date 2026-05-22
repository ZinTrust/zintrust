import { R2Driver, StorageDriverRegistry } from '@zintrust/core';

type StorageDriverEntry = {
  driver: unknown;
  normalize?: (raw: Record<string, unknown>) => Record<string, unknown>;
};

type Registry = {
  register: (driverName: string, entry: StorageDriverEntry) => void;
};

export function registerR2StorageDriver(registry: Registry): void {
  if (R2Driver === undefined) return;

  registry.register('r2', { driver: R2Driver });
}

if (typeof StorageDriverRegistry !== 'undefined') {
  registerR2StorageDriver(StorageDriverRegistry);
}
