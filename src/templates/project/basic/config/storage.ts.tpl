import { Env, type StorageConfigOverrides } from '@zintrust/core';

/**
 * Storage Configuration (default override)
 *
 * Keep this file declarative:
 * - Core owns driver setup and env parsing/default logic.
 * - Projects can override config by editing values below.
 */

export default {
  default: Env.get('STORAGE_CONNECTION', Env.get('STORAGE_DRIVER', 'local')).trim().toLowerCase(),
  drivers: {
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
      region: Env.get('AWS_REGION', 'us-east-1'),
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
  },
  temp: {
    path: Env.get('TEMP_PATH', 'storage/temp'),
    maxAge: Env.getInt('TEMP_FILE_MAX_AGE', 86400),
  },
  uploads: {
    maxSize: Env.get('MAX_UPLOAD_SIZE', '100mb'),
    allowedMimes: Env.get('ALLOWED_UPLOAD_MIMES', 'jpg,jpeg,png,pdf,doc,docx'),
    path: Env.get('UPLOADS_PATH', 'storage/uploads'),
  },
  backups: {
    path: Env.get('BACKUPS_PATH', 'storage/backups'),
    driver: Env.get('BACKUP_DRIVER', 's3'),
  },
} satisfies StorageConfigOverrides;
