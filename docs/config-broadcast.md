# broadcast config

- Source: `src/config/broadcast.ts`

## Usage

Import from the framework:

```ts
import { broadcast } from '@zintrust/core';

// Example (if supported by the module):
// broadcast.*
```

import { Broadcast, broadcastConfig } from '@zintrust/core';

// Default broadcaster (from `broadcastConfig.default`)
await Broadcast.send('channel', 'event', { ok: true });

// Named broadcaster
await Broadcast.broadcaster('redis').send('channel', 'event', { ok: true });

// Config lookup
const defaultCfg = broadcastConfig.getDriverConfig();
const redisCfg = broadcastConfig.getDriverConfig('redis');

// Strict behavior: explicit unknown broadcaster throws a ConfigError
// broadcastConfig.getDriverConfig('missing');
/\*\*

## Notes

- Broadcast supports named broadcasters via `broadcastConfig.drivers`.
- `broadcastConfig.getDriverConfig(name?)` supports the reserved alias `default`.
- If you explicitly select a broadcaster name that is not configured, it throws a `ConfigError`.
  } as const;

export default Object.freeze(broadcastConfigObj);

```

```
