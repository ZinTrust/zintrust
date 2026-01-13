# Cache Configuration

ZinTrust caching is configured via the framework-level `cacheConfig` object. It defines:

- Which cache store is the default (`cacheConfig.default`)
- Built-in store configs (`cacheConfig.drivers.*`)
- How to resolve named stores (`cacheConfig.getDriver(name?)`)

**Source:** `src/config/cache.ts`

## Public API

```ts
import { Cache, cache, cacheConfig } from '@zintrust/core';

// Resolve config for the default store
const defaultStoreConfig = cacheConfig.getDriver();

// Resolve config for a named store
const redisStoreConfig = cacheConfig.getDriver('redis');

// Use the default store
await Cache.set('user:1', { id: 1 }, 60);

// Or use the alias (identical to Cache)
await cache.get('user:1');

// Use a named store (creates/uses a separate singleton driver instance)
await Cache.store('redis').set('user:1', { id: 1 }, 60);
```

## Environment Variables

### Store selection

The default store is chosen from (in order):

1. `CACHE_CONNECTION` (if non-empty)
2. `CACHE_DRIVER` (default: `memory`)

Selection is trimmed and lowercased.

Important behavior:

- `cacheConfig.default` is computed at module initialization time. If you change env vars after importing `cacheConfig`, it will not recompute.
- `cacheConfig.getDriver()` does **not** silently fall back when the default store name is unknown. It throws a configuration error.

### Common variables

| Variable            | Default     | Meaning                                                       |
| ------------------- | ----------- | ------------------------------------------------------------- |
| `CACHE_KEY_PREFIX`  | `zintrust:` | Prefix to namespace keys (recommended in multi-app Redis/KV). |
| `CACHE_DEFAULT_TTL` | `3600`      | Default TTL in seconds (application-level default).           |

### Built-in stores and variables

| Store       | Driver      | Variables                                     | Notes                                         |
| ----------- | ----------- | --------------------------------------------- | --------------------------------------------- |
| `memory`    | `memory`    | `CACHE_MEMORY_TTL`                            | In-process only; not shared across instances. |
| `redis`     | `redis`     | `REDIS_HOST`, `REDIS_PORT`, `CACHE_REDIS_TTL` | Remote shared cache.                          |
| `mongodb`   | `mongodb`   | `MONGO_URI`, `MONGO_DB`, `CACHE_MONGO_TTL`    | Uses MongoDB as a cache store.                |
| `kv`        | `kv`        | `CACHE_KV_TTL`                                | Cloudflare KV binding named `CACHE`.          |
| `kv-remote` | `kv-remote` | `CACHE_KV_TTL`                                | KV via the remote proxy mechanism.            |

## Store Resolution Semantics

### `cacheConfig.getDriver(name?)`

Resolves a store configuration:

- `name` is optional. If omitted, it resolves the default store.
- `name === 'default'` is a reserved alias of the configured default.
- If you explicitly select a store name that is not configured, it throws a `ConfigError`.
- If the drivers map is empty, it throws `No cache stores are configured`.

## How `Cache` Uses Configuration

The `Cache` helper (`src/cache/Cache.ts`) resolves a driver like this:

1. Calls `cacheConfig.getDriver(storeName?)` to get a `CacheDriverConfig`
2. Looks up an external driver factory in `CacheDriverRegistry` (if registered)
3. Otherwise, uses a built-in driver implementation based on `driverConfig.driver`

Driver instances are cached per store key:

- Default store is cached under `default`
- Named stores are cached under their normalized store name

In tests, you can reset the singleton cache state with `Cache.reset()`.

## Operational Guidance

- Prefer `redis`, `kv`, or another shared store in multi-instance deployments.
- Use `CACHE_KEY_PREFIX` to avoid collisions when multiple services share the same backend.
- Be aware of store-specific TTL semantics. For example, Cloudflare KV enforces a minimum TTL of 60 seconds when an expiration TTL is provided.
