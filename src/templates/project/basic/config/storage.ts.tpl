/**
 * Storage Configuration
 * File storage and cloud storage settings
 * Sealed namespace for immutability
 */

import { Env } from '@config/env';

type EnvGetValue = ReturnType<typeof Env.get>;
type EnvGetBoolValue = ReturnType<typeof Env.getBool>;

type LocalStorageDriverConfig = {
  driver: 'local';
  root: EnvGetValue;
  url: EnvGetValue;
  visibility: EnvGetValue;
};

type S3StorageDriverConfig = {
  driver: 's3';
  key: EnvGetValue;
  secret: EnvGetValue;
  region: typeof Env.AWS_REGION;
  bucket: EnvGetValue;
  url: EnvGetValue;
  endpoint: EnvGetValue;
  usePathStyleUrl: EnvGetBoolValue;
};

type GcsStorageDriverConfig = {
  driver: 'gcs';
  projectId: EnvGetValue;
  keyFile: EnvGetValue;
  bucket: EnvGetValue;
  url: EnvGetValue;
};

type StorageDrivers = {
  local: LocalStorageDriverConfig;
  s3: S3StorageDriverConfig;
  gcs: GcsStorageDriverConfig;
};

type StorageDriverName = keyof StorageDrivers;
type StorageDriverConfig = StorageDrivers[StorageDriverName];

type StorageConfigRuntime = {
  default: string;
  drivers: StorageDrivers;
};

const isStorageDriverName = (value: string, drivers: StorageDrivers): value is StorageDriverName => {
  return value in drivers;
};

const getStorageDriver = (config: StorageConfigRuntime): StorageDriverConfig => {
  const driverName = config.default;

  if (isStorageDriverName(driverName, config.drivers)) {
    return config.drivers[driverName];
  }

  return config.drivers.local;
};

const storageConfigObj = {
  /**
   * Default storage driver
   */
  default: Env.get('STORAGE_DRIVER', 'local'),

  /**
   * Storage drivers configuration
   */
  drivers: {
    local: {
      driver: 'local' as const,
      root: Env.get('STORAGE_PATH', 'storage'),
      url: Env.get('STORAGE_URL', '/storage'),
      visibility: Env.get('STORAGE_VISIBILITY', 'private'),
    },
    s3: {
      driver: 's3' as const,
      key: Env.get('AWS_ACCESS_KEY_ID'),
      secret: Env.get('AWS_SECRET_ACCESS_KEY'),
      region: Env.AWS_REGION,
      bucket: Env.get('AWS_S3_BUCKET'),
      url: Env.get('AWS_S3_URL'),
      endpoint: Env.get('AWS_S3_ENDPOINT'),
      usePathStyleUrl: Env.getBool('AWS_S3_USE_PATH_STYLE_URL', false),
    },
    gcs: {
      driver: 'gcs' as const,
      projectId: Env.get('GCS_PROJECT_ID'),
      keyFile: Env.get('GCS_KEY_FILE'),
      bucket: Env.get('GCS_BUCKET'),
      url: Env.get('GCS_URL'),
    },
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
  temp: {
    path: Env.get('TEMP_PATH', 'storage/temp'),
    maxAge: Env.getInt('TEMP_FILE_MAX_AGE', 86400), // 24 hours
  },

  /**
   * Uploads settings
   */
  uploads: {
    maxSize: Env.get('MAX_UPLOAD_SIZE', '100mb'),
    allowedMimes: Env.get('ALLOWED_UPLOAD_MIMES', 'jpg,jpeg,png,pdf,doc,docx'),
    path: Env.get('UPLOADS_PATH', 'storage/uploads'),
  },

  /**
   * Backups settings
   */
  backups: {
    path: Env.get('BACKUPS_PATH', 'storage/backups'),
    driver: Env.get('BACKUP_DRIVER', 's3'),
  },
};

export const storageConfig = Object.freeze(storageConfigObj);

export type StorageConfig = typeof storageConfig;
