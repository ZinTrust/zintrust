import { GcsDriver, StorageDriverRegistry } from '@zintrust/core/storage';

type StorageDriverEntry = {
  driver: unknown;
  normalize?: (raw: Record<string, unknown>) => Record<string, unknown>;
};

type Registry = {
  register: (driverName: string, entry: StorageDriverEntry) => void;
};

export function registerGcsStorageDriver(registry: Registry): void {
  if (GcsDriver === undefined) return;

  registry.register('gcs', { driver: GcsDriver });
}

if (typeof StorageDriverRegistry !== 'undefined') {
  registerGcsStorageDriver(StorageDriverRegistry);
}
