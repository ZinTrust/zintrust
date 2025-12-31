/**
 * Storage Configuration
 * File storage and cloud storage settings
 * Sealed namespace for immutability
 */

import { Env } from '@config/env';
import type {
  StorageConfigRuntime,
  StorageDriverConfig,
  StorageDriverName,
  StorageDrivers,
} from '@config/type';

const isStorageDriverName = (
  value: string,
  drivers: StorageDrivers
): value is StorageDriverName => {
  return value in drivers;
};

const getStorageDriver = (config: StorageConfigRuntime): StorageDriverConfig => {
  const driverName = config.default;

  if (isStorageDriverName(driverName, config.drivers)) {
    return config.drivers[driverName];
  }

  return config.drivers.local;
};

const getDrivers = (): StorageDrivers => ({
  local: {
    driver: 'local' as const,
    root: Env.get('STORAGE_PATH', 'storage'),
    url: Env.get('STORAGE_URL', '/storage'),
    visibility: Env.get('STORAGE_VISIBILITY', 'private'),
  },
  s3: {
    driver: 's3' as const,
    accessKeyId: Env.get('AWS_ACCESS_KEY_ID', ''),
    secretAccessKey: Env.get('AWS_SECRET_ACCESS_KEY', ''),
    region: Env.AWS_REGION,
    bucket: Env.get('AWS_S3_BUCKET', ''),
    url: Env.get('AWS_S3_URL', ''),
    endpoint: Env.get('AWS_S3_ENDPOINT', ''),
    usePathStyleUrl: Env.getBool('AWS_S3_USE_PATH_STYLE_URL', false),
  },
  r2: {
    driver: 'r2' as const,
    accessKeyId: Env.get('R2_ACCESS_KEY_ID', ''),
    secretAccessKey: Env.get('R2_SECRET_ACCESS_KEY', ''),
    region: Env.get('R2_REGION', ''),
    bucket: Env.get('R2_BUCKET', ''),
    endpoint: Env.get('R2_ENDPOINT', ''),
    url: Env.get('R2_URL', ''),
  },
  gcs: {
    driver: 'gcs' as const,
    projectId: Env.get('GCS_PROJECT_ID', ''),
    keyFile: Env.get('GCS_KEY_FILE', ''),
    bucket: Env.get('GCS_BUCKET', ''),
    url: Env.get('GCS_URL', ''),
  },
});

const storageConfigObj = {
  /**
   * Default storage driver (dynamic; tests may mutate process.env)
   */
  get default(): string {
    return Env.get('STORAGE_DRIVER', 'local');
  },

  /**
   * Storage drivers configuration (dynamic; tests may mutate process.env)
   */
  get drivers(): StorageDrivers {
    return getDrivers();
  },

  /**
   * Get storage driver config
   */
  getDriver(this: StorageConfigRuntime): StorageDriverConfig {
    return getStorageDriver(this);
  },

  /**
   * Temporary file settings
   */
  get temp(): { path: string; maxAge: number } {
    return {
      path: Env.get('TEMP_PATH', 'storage/temp'),
      maxAge: Env.getInt('TEMP_FILE_MAX_AGE', 86400), // 24 hours
    };
  },

  /**
   * Uploads settings
   */
  get uploads(): { maxSize: string; allowedMimes: string; path: string } {
    return {
      maxSize: Env.get('MAX_UPLOAD_SIZE', '100mb'),
      allowedMimes: Env.get('ALLOWED_UPLOAD_MIMES', 'jpg,jpeg,png,pdf,doc,docx'),
      path: Env.get('UPLOADS_PATH', 'storage/uploads'),
    };
  },

  /**
   * Backups settings
   */
  get backups(): { path: string; driver: string } {
    return {
      path: Env.get('BACKUPS_PATH', 'storage/backups'),
      driver: Env.get('BACKUP_DRIVER', 's3'),
    };
  },
};

export const storageConfig = Object.freeze(storageConfigObj);

export type StorageConfig = typeof storageConfig;
