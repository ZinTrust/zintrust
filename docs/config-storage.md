# storage config

- Source: `src/config/storage.ts`

## Usage

Import from the framework:

```ts
import { Storage, storageConfig } from '@zintrust/core';

// Default disk (from `storageConfig.default`)
const d1 = Storage.getDisk();

// Named disk
const d2 = Storage.getDisk('s3');

// Config lookup
const defaultCfg = storageConfig.getDriverConfig();
const s3Cfg = storageConfig.getDriverConfig('s3');

// Strict behavior: explicit unknown disk throws a ConfigError
// storageConfig.getDriverConfig('missing');
```

## Notes

- Storage supports named disks via `storageConfig.drivers`.
- `storageConfig.getDriverConfig(name?)` supports the reserved alias `default`.
- If you explicitly select a disk name that is not configured, it throws a `ConfigError`.
