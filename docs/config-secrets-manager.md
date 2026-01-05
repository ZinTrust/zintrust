# SecretsManager config

- Source: `src/config/SecretsManager.ts`

## Usage

Import from the framework:

```ts
import { SecretsManager } from '@zintrust/core';

// SecretsManager is a singleton (platform-routed) secrets interface.
// It is not a named-instance registry like cache/storage/notification.
const manager = SecretsManager.getInstance();

const jwtSecret = await manager.getSecret('jwt/secret');
```

## Notes

- SecretsManager currently uses a singleton instance (`SecretsManager.getInstance(config?)`).
- The backend is selected by `SecretConfig.platform` (e.g. `local`, `cloudflare`, `deno`, `aws`).
