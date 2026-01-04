# SecretsManager config

- Source: `src/config/SecretsManager.ts`

## Usage

Import from the framework:

```ts
import { SecretsManager } from '@zintrust/core';

// Example (if supported by the module):
// SecretsManager.*
```

## Snapshot (top)

```ts
/**
 * Unified Secrets Management Layer
 * Abstracts secrets retrieval across different cloud platforms
 * Supports: AWS Secrets Manager, Parameter Store, Cloudflare KV, Deno env
 */

import { Logger } from '@zintrust/core';
import type {
  GetSecretOptions,
  SecretConfig,
  SecretsManagerInstance,
  SetSecretOptions,
} from '@zintrust/core';
import { ErrorFactory } from '@zintrust/core';

let instance: SecretsManagerInstance | undefined;

function pruneCache(
  cache: Map<string, { value: string; expiresAt: number }>,
  maxEntries: number
): void {
  if (cache.size <= maxEntries) return;

  const now = Date.now();
  for (const [key, entry] of cache.entries()) {
    if (entry.expiresAt <= now) cache.delete(key);
  }

  // If still large, drop oldest entries (Map preserves insertion order)
  while (cache.size > maxEntries) {
    const next = cache.keys().next();
    if (next.done === true) break;
    cache.delete(next.value);
  }
}

/**
 * Get secret value from appropriate backend
 */
async function runGetSecret(
  config: SecretConfig,
  cache: Map<string, { value: string; expiresAt: number }>,
  key: string,
  options?: GetSecretOptions
): Promise<string> {
  // Check cache first
  const cached = cache.get(key);
  if (cached !== undefined && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  // Opportunistic cleanup if cache has grown
  pruneCache(cache, 500);

  let value: string;

  switch (config.platform) {
    case 'aws':
      value = await getFromAWSSecretsManager(key);
      break;
    case 'cloudflare':
      value = await getFromCloudflareKV(config, key);
      break;
    case 'deno':
      value = await getFromDenoEnv(key);
      break;
    case 'local':
    default:
      value = await getFromEnv(key);
  }
```

## Snapshot (bottom)

```ts

  // API keys
  JWT_SECRET: 'jwt/secret',
  JWT_REFRESH_SECRET: 'jwt/refresh-secret',

  // Encryption
  ENCRYPTION_KEY: 'encryption/key',
  ENCRYPTION_IV: 'encryption/iv',

  // Third-party APIs
  STRIPE_API_KEY: 'stripe/api-key',
  STRIPE_WEBHOOK_SECRET: 'stripe/webhook-secret',
  SENDGRID_API_KEY: 'sendgrid/api-key',
  GITHUB_TOKEN: 'github/token',

  // Session/CSRF
  SESSION_SECRET: 'session/secret',
  CSRF_SECRET: 'csrf/secret',
} as const);

/**
 * Helper to get database credentials using secrets manager
 */
export async function getDatabaseCredentials(): Promise<DatabaseCredentials> {
  const manager = SecretsManager.getInstance();

  return {
    username: await manager.getSecret(SECRETS.DB_USERNAME),
    password: await manager.getSecret(SECRETS.DB_PASSWORD),
    host: await manager.getSecret(SECRETS.DB_HOST),
    port: Number.parseInt(await manager.getSecret(SECRETS.DB_PORT), 10),
    database: await manager.getSecret(SECRETS.DB_DATABASE),
  };
}

/**
 * Helper to get JWT secrets
 */
export async function getJwtSecrets(): Promise<JwtSecrets> {
  const manager = SecretsManager.getInstance();

  return {
    secret: await manager.getSecret(SECRETS.JWT_SECRET),
    refreshSecret: await manager.getSecret(SECRETS.JWT_REFRESH_SECRET),
  };
}

export interface DatabaseCredentials {
  username: string;
  password: string;
  host: string;
  port: number;
  database: string;
}

export interface JwtSecrets {
  secret: string;
  refreshSecret: string;
}

```
