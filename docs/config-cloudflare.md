# cloudflare config

- Source: `src/config/cloudflare.ts`

## Usage

Import from the framework:

```ts
import { cloudflare } from '@zintrust/core';

// Example (if supported by the module):
// cloudflare.*
```

## Snapshot (top)

```ts
/**
 * Cloudflare Workers Environment Access
 *
 * Centralizes access to Workers bindings via globalThis.env.
 * This keeps runtime-specific globals out of adapters/drivers.
 */

import { KVNamespace, WorkersEnv } from '@zintrust/core';
import type { DatabaseConfig, ID1Database } from '@zintrust/core';

const getWorkersEnv = (): WorkersEnv | null => {
  const env = (globalThis as unknown as { env?: unknown }).env;
  if (env === undefined || env === null) return null;
  if (typeof env !== 'object') return null;
  return env as WorkersEnv;
};

const getD1Binding = (config: DatabaseConfig): ID1Database | null => {
  if (config.d1 !== undefined && config.d1 !== null) return config.d1;

  const env = getWorkersEnv();
  const envDb = env === null ? undefined : (env['DB'] as ID1Database | undefined);
  if (envDb !== undefined) return envDb;

  const globalDb = (globalThis as unknown as { DB?: ID1Database }).DB;
  if (globalDb !== undefined) return globalDb;

  return null;
};

const getKVBinding = (bindingName = 'CACHE'): KVNamespace | null => {
  const env = getWorkersEnv();
  if (env === null) return null;

  const kv = env[bindingName] as KVNamespace | undefined;
  return kv ?? null;
};

export const Cloudflare = Object.freeze({
  getWorkersEnv,
  getD1Binding,
  getKVBinding,
});
```

## Snapshot (bottom)

```ts
/**
 * Cloudflare Workers Environment Access
 *
 * Centralizes access to Workers bindings via globalThis.env.
 * This keeps runtime-specific globals out of adapters/drivers.
 */

import { KVNamespace, WorkersEnv } from '@zintrust/core';
import type { DatabaseConfig, ID1Database } from '@zintrust/core';

const getWorkersEnv = (): WorkersEnv | null => {
  const env = (globalThis as unknown as { env?: unknown }).env;
  if (env === undefined || env === null) return null;
  if (typeof env !== 'object') return null;
  return env as WorkersEnv;
};

const getD1Binding = (config: DatabaseConfig): ID1Database | null => {
  if (config.d1 !== undefined && config.d1 !== null) return config.d1;

  const env = getWorkersEnv();
  const envDb = env === null ? undefined : (env['DB'] as ID1Database | undefined);
  if (envDb !== undefined) return envDb;

  const globalDb = (globalThis as unknown as { DB?: ID1Database }).DB;
  if (globalDb !== undefined) return globalDb;

  return null;
};

const getKVBinding = (bindingName = 'CACHE'): KVNamespace | null => {
  const env = getWorkersEnv();
  if (env === null) return null;

  const kv = env[bindingName] as KVNamespace | undefined;
  return kv ?? null;
};

export const Cloudflare = Object.freeze({
  getWorkersEnv,
  getD1Binding,
  getKVBinding,
});
```
