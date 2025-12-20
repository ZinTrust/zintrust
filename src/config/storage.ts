/**
 * Storage Configuration
 * File storage and cloud storage settings
 */

import { Env } from '@config/env';

export const storageConfig = {
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
  getDriver() {
    const driverName = this.default as keyof typeof this.drivers;
    return this.drivers[driverName];
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
} as const;

export type StorageConfig = typeof storageConfig;
