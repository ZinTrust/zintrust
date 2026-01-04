# Storage — Usage & Configuration ✅

## Overview 💡

The Storage subsystem provides a registry of _disks_ (named drivers) and a simple API for file operations. Drivers are config-first and follow the Zintrust patterns (no classes, sealed namespaces).

Supported drivers:

- `local` — filesystem-backed (`LocalDriver`)
- `s3` — AWS S3 + S3-compatible storage (`S3Driver`)
- `r2` — Cloudflare R2 (wrapper around S3-style behavior)
- `gcs` — Google Cloud Storage (`GcsDriver`)

## Install drivers

```bash
zin add storage:s3
zin add storage:r2
zin add storage:gcs
```

---

## Quick start 🔧

Put and get files via the driver registry:

```ts
import { Storage } from '@storage';

const disk = Storage.getDisk('local');
await disk.driver.put(disk.config as any, 'path/to/file.txt', Buffer.from('hello'));
const contents = await disk.driver.get(disk.config as any, 'path/to/file.txt');
```

In most app code you should use helper-by-abstraction provided by toolkits or helper functions so the driver details stay in one place.

### Temporary URLs (signed / expiring)

Zintrust exposes a convenience API for expiring URLs:

```ts
import { Storage } from '@storage';

// Typical usage: give a browser a time-limited URL
const url = await Storage.tempUrl('s3', 'exports/report.csv', { expiresIn: 60 * 10 });
```

Notes:

- S3/R2/GCS drivers support signed URLs.
- Local driver generates a signed URL pointing to `/storage/download?token=...` (requires `STORAGE_URL` and `APP_KEY`).

---

## Configuration & env vars ⚙️

The disk configuration comes from `src/config/storage.ts` which reads these environment variables:

Common:

- STORAGE_DRIVER — default disk (e.g., `local`)

Local:

- STORAGE_PATH — default path for files (default: `storage`)
- STORAGE_URL — optional base URL
- APP_KEY — required for local signed `tempUrl()`

S3:

- AWS_ACCESS_KEY_ID
- AWS_SECRET_ACCESS_KEY
- AWS_REGION
- AWS_S3_BUCKET
- AWS_S3_ENDPOINT (optional)
- AWS_S3_URL (optional)
- AWS_S3_USE_PATH_STYLE_URL (bool)

### S3-compatible providers

The `s3` driver supports custom endpoints and (optionally) path-style URLs, which is the common setup for **S3-compatible** object storage (not just AWS).

In practice, the `s3` driver should work with most providers that expose an S3 API and accept **SigV4** signed requests/URLs.

Examples of “S3-type” storage providers (non-exhaustive):

- AWS S3
- MinIO
- DigitalOcean Spaces
- Wasabi
- Backblaze B2 (S3 API)
- Ceph RGW (S3 API)
- Linode Object Storage
- Vultr Object Storage

Cloudflare R2 is also S3-compatible, but Zintrust exposes it as a dedicated `r2` driver (which wraps S3-style behavior).

To use an S3-compatible provider, you typically set:

- `AWS_S3_ENDPOINT` to the provider’s S3 API endpoint
- `AWS_S3_USE_PATH_STYLE_URL=true` when the provider requires path-style addressing
- `AWS_REGION` when required by the provider (some accept any non-empty region)

Keep `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and `AWS_S3_BUCKET` as usual.

R2 (Cloudflare):

- R2_ACCESS_KEY_ID
- R2_SECRET_ACCESS_KEY
- R2_BUCKET
- R2_ENDPOINT
- R2_REGION
- R2_URL

GCS (Google Cloud Storage):

- GCS_BUCKET
- GCS_PROJECT_ID (optional)
- GCS_KEY_FILE (optional)
- GCS_URL (optional)

> Tip: Keep cloud credentials managed in your infrastructure secrets (CLI-only secrets toolkit) and avoid runtime secret discovery where possible.

---

## Testing (fakes) 🧪

Use `FakeStorage` for tests — it captures `put` operations in-memory and exposes assertion helpers:

```ts
import FakeStorage from '@storage/testing';

FakeStorage.reset();
await FakeStorage.put('local', 'a.txt', Buffer.from('x'));
FakeStorage.assertExists('local', 'a.txt');
```

This keeps tests fast and deterministic and is compatible with Mail attachment tests.

---

## Implementation notes 🛠️

- `S3Driver` implements SigV4 signing (minimal helper, no heavy AWS SDK) and supports custom endpoints and path-style URL for services like R2.
- `R2Driver` delegates to `S3Driver` with path-style settings and constructs R2 URLs.
- `LocalDriver` returns filesystem paths and optional URL builder.
- `GcsDriver` can generate signed URLs when a compatible GCS client is available.

---
