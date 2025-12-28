import { storageConfig } from '@config/storage';
import { ErrorFactory } from '@exceptions/ZintrustError';
import { LocalDriver } from '@storage/drivers/Local';
import { R2Driver } from '@storage/drivers/R2';
import { S3Driver } from '@storage/drivers/S3';

export type DiskName = 'local' | 's3' | 'gcs' | 'r2';

export type StorageDisk = {
  driver: typeof LocalDriver | typeof S3Driver | typeof R2Driver;
  config: unknown;
};

export const Storage = Object.freeze({
  getDisk(name?: string): StorageDisk {
    const diskName = name ?? storageConfig.default;
    // disk is config object; dispatch based on requested name
    const drivers = storageConfig.drivers as Record<string, { driver: string }>;
    const config = drivers[diskName as string];
    if (config === undefined)
      throw ErrorFactory.createValidationError('Storage: unknown disk', { disk: diskName });

    if (config.driver === 'local') return { driver: LocalDriver, config };
    if (config.driver === 's3') return { driver: S3Driver, config };
    if (config.driver === 'r2') return { driver: R2Driver, config };

    throw ErrorFactory.createValidationError('Storage: unsupported disk driver', {
      driver: config.driver,
    });
  },
});

export default Storage;
