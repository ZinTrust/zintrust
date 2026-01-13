/**
 * Storage Configuration
 * File storage and cloud storage settings
 * Sealed namespace for immutability
 */

import { Env } from '@config/env';
import type { StorageConfigRuntime, StorageDriverConfig, StorageDrivers } from '@config/type';
import { ErrorFactory } from '@exceptions/ZintrustError';
const hasOwn = <T extends object>(obj: T, key: PropertyKey): key is keyof T => {
  return Object.hasOwn(obj, key);
};

const getStorageDriver = (config: StorageConfigRuntime, name?: string): StorageDriverConfig => {
  const selected = String(name ?? config.default).trim();
  const diskName = selected === 'default' ? String(config.default).trim() : selected;
  const isExplicitSelection =
    name !== undefined && String(name).trim().length > 0 && String(name).trim() !== 'default';

  if (diskName !== '' && hasOwn(config.drivers, diskName)) {
    const resolved = config.drivers[diskName];
    if (resolved !== undefined) return resolved;
  }

  if (isExplicitSelection) {
    throw ErrorFactory.createConfigError(`Storage disk not configured: ${diskName}`);
  }

  if (Object.keys(config.drivers ?? {}).length === 0) {
    throw ErrorFactory.createConfigError('No storage disks are configured');
  }

  throw ErrorFactory.createConfigError(
    `Storage default disk not configured: ${diskName || '<empty>'}`
  );
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
    return Env.get('STORAGE_CONNECTION', Env.get('STORAGE_DRIVER', 'local')).trim().toLowerCase();
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
   * Get a storage disk configuration by name.
   *
   * - When `name` is provided and not configured, this throws.
   * - When `name` is omitted, it resolves the configured default with a backwards-compatible fallback.
   * - Reserved name `default` aliases the configured default.
   */
  getDriverConfig(this: StorageConfigRuntime, name?: string): StorageDriverConfig {
    return getStorageDriver(this, name);
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
