# Storage — Usage & Configuration ✅

## Overview 💡

The Storage subsystem provides a registry of _disks_ (named drivers) and a simple API for file operations. Drivers are config-first and follow the Zintrust patterns (no classes, sealed namespaces).

Supported drivers:

- `local` — filesystem-backed (`LocalDriver`)
- `s3` — AWS S3 (`S3Driver`)
- `r2` — Cloudflare R2 (wrapper around S3-style behavior)

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

---

## Configuration & env vars ⚙️

The disk configuration comes from `src/config/storage.ts` which reads these environment variables:

Common:

- STORAGE_DRIVER — default disk (e.g., `local`)

Local:

- STORAGE_PATH — default path for files (default: `storage`)
- STORAGE_URL — optional base URL

S3:

- AWS_ACCESS_KEY_ID
- AWS_SECRET_ACCESS_KEY
- AWS_REGION
- AWS_S3_BUCKET
- AWS_S3_ENDPOINT (optional)
- AWS_S3_URL (optional)
- AWS_S3_USE_PATH_STYLE_URL (bool)

R2 (Cloudflare):

- R2_ACCESS_KEY_ID
- R2_SECRET_ACCESS_KEY
- R2_BUCKET
- R2_ENDPOINT
- R2_REGION
- R2_URL

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

---
