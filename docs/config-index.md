# index config

- Source: `src/config/index.ts`

## Usage

Import from the framework:

```ts
import { index } from '@zintrust/core';

// Example (if supported by the module):
// index.*
```

## Notes

This module is the central export point for the framework’s config objects.

- It includes `broadcastConfig` and `notificationConfig` (in addition to `app`, `database`, `cache`, `queue`, etc.).
- It exports a combined frozen `config` object for convenience.

See the source in `src/config/index.ts` for the authoritative list.
