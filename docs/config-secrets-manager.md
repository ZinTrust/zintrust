# SecretsManager config

Source: `src/config/SecretsManager.ts`

ZinTrust’s `SecretsManager` is a **singleton, platform-routed** secrets interface.

It is not a multi-instance registry like cache/storage/notification; instead you initialize it once (per process) with a `SecretConfig` and then use it everywhere.

## Initialization and usage

You must initialize the singleton before using it.

```ts
import { SecretsManager } from '@zintrust/core';

// Initialize once during boot:
SecretsManager.getInstance({ platform: 'local' });

// Then anywhere:
const jwtSecret = await SecretsManager.getSecret('jwt/secret');
```

If you call `SecretsManager.getInstance()` without a config before it has been initialized, it throws a config error:

- “SecretsManager not initialized. Call getInstance(config) first.”

## Platforms

`SecretConfig.platform` chooses the backend:

- `local`: reads from Node `process.env` (throws NotFound when missing)
- `deno`: reads from `Deno.env.get` (throws NotFound when missing)
- `cloudflare`: uses a Cloudflare KV namespace you provide as `config.kv`
- `aws`: placeholder in core (throws config errors; see below)

### Cloudflare KV mode

To use Cloudflare KV, you must pass a KV implementation:

```ts
import { SecretsManager } from '@zintrust/core';

SecretsManager.getInstance({
  platform: 'cloudflare',
  kv: env.CACHE, // must implement get/put/delete/list
});
```

If `kv` is missing, operations throw:

- “Cloudflare KV namespace not configured”

### AWS mode (core limitation)

The core implementation does not include the AWS SDK. In `platform: 'aws'` mode:

- `getSecret`, `setSecret`, `deleteSecret` throw config errors indicating AWS SDK is not available in core.
- `listSecrets` currently returns an empty array.

If you need AWS Secrets Manager in a real app, use an external wrapper/provider integration rather than relying on core.

## Caching

`getSecret()` caches values in-memory.

- Default cache TTL: `1 hour` (`3600000ms`)
- Override per call via `GetSecretOptions.cacheTtl`
- Cache is capped and pruned opportunistically (max ~500 entries)

Practical guidance:

- For frequently accessed secrets, caching reduces network calls.
- After rotation, call `SecretsManager.clearCache()` (or clear a specific key).

## Supported operations

The singleton exposes:

- `getSecret(key, options?)`
- `setSecret(key, value, options?)` (cloudflare/aws only; local/deno throw)
- `deleteSecret(key)` (cloudflare/aws only; local/deno throw)
- `listSecrets(prefix?)` (cloudflare/aws only; local/deno return `[]`)
- `rotateSecret(key)` (not implemented; throws config errors)

## Predefined keys and helpers

`src/config/SecretsManager.ts` defines a `SECRETS` object with common key names (DB credentials, JWT secrets, etc.) and helpers:

- `getDatabaseCredentials()`
- `getJwtSecrets()`

These helpers call `SecretsManager.getInstance()` and then fetch multiple secrets.
