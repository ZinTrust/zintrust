# Storage config

Source: `src/config/storage.ts`

This page documents the configuration object (`storageConfig`) that selects and parameterizes Storage “disks”.

Disks are named driver configs (e.g. `local`, `s3`, `r2`) and can be extended by app-level configuration templates.

## Default disk selection

The default disk name is computed dynamically:

- `STORAGE_CONNECTION` / `STORAGE_DRIVER` selects the disk key (defaults to `local`)
- the value is normalized via `trim().toLowerCase()`

## Usage

```ts
import { Storage, storageConfig } from '@zintrust/core';

// Resolve and use the default disk
const disk = Storage.getDisk();
const defaultCfg = storageConfig.getDriverConfig();

// Resolve and use a named disk
const s3Disk = Storage.getDisk('s3');
const s3Cfg = storageConfig.getDriverConfig('s3');
```

## Built-in disks

Core provides these driver configs:

- `local`
- `s3`
- `r2`
- `gcs`

Each is populated from environment variables.

### Local

- `STORAGE_PATH` (default `storage`)
- `STORAGE_URL` (default `/storage`)
- `STORAGE_VISIBILITY` (default `private`)

### S3

- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`
- `AWS_REGION` (via `Env.AWS_REGION`)
- `AWS_S3_BUCKET`, `AWS_S3_URL`, `AWS_S3_ENDPOINT`
- `AWS_S3_USE_PATH_STYLE_URL` (boolean)

### Cloudflare R2

- `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`
- `R2_REGION`, `R2_BUCKET`, `R2_ENDPOINT`, `R2_URL`

### Google Cloud Storage

- `GCS_PROJECT_ID`, `GCS_KEY_FILE`, `GCS_BUCKET`, `GCS_URL`

## Reserved alias: `default`

`storageConfig.getDriverConfig(name?)` treats the string `default` as a reserved alias for the configured default disk.

```ts
const cfg = storageConfig.getDriverConfig('default');
```

## Strictness and errors

`storageConfig.getDriverConfig(name?)` is strict about explicit selection:

- If you request a disk name that is not configured, it throws: “Storage disk not configured: …”.
- If there are no configured disks at all, it throws: “No storage disks are configured”.
- If the default disk points at a missing disk, it throws: “Storage default disk not configured: …”.

## Temporary files

`storageConfig.temp`:

- `TEMP_PATH` (default `storage/temp`)
- `TEMP_FILE_MAX_AGE` (seconds, default `86400`)

## Uploads

`storageConfig.uploads`:

- `MAX_UPLOAD_SIZE` (default `100mb`)
- `ALLOWED_UPLOAD_MIMES` (default `jpg,jpeg,png,pdf,doc,docx`)
- `UPLOADS_PATH` (default `storage/uploads`)

## Backups

`storageConfig.backups`:

- `BACKUPS_PATH` (default `storage/backups`)
- `BACKUP_DRIVER` (default `s3`)
