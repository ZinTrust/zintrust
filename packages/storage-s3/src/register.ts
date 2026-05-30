import { S3Driver, StorageDriverRegistry } from '@zintrust/core/storage';

type StorageDriverEntry = {
  driver: unknown;
  normalize?: (raw: Record<string, unknown>) => Record<string, unknown>;
};

type Registry = {
  register: (driverName: string, entry: StorageDriverEntry) => void;
};

export function registerS3StorageDriver(registry: Registry): void {
  if (S3Driver === undefined) return;

  registry.register('s3', { driver: S3Driver });
}

if (typeof StorageDriverRegistry !== 'undefined') {
  registerS3StorageDriver(StorageDriverRegistry);
}
