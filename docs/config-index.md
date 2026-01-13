# Config index

Source: `src/config/index.ts`

ZinTrust exposes a single, aggregated config surface via a frozen object export. This gives you a predictable place to import configuration defaults, types, and helpers.

## Import

```ts
import { Config } from '@zintrust/core';

// Example: consume normalized config objects
const app = Config.app;
const logger = Config.logger;
```

`Config` is created as a single object and then sealed via `Object.freeze(...)` so consumers treat it as read-only.

## What lives in Config

`Config` is a composition of config modules under `src/config/*`.

Common areas include:

- `Config.app`: app identity, environment, base URL and runtime flags
- `Config.logger`: logging defaults and sinks
- `Config.constants`: shared constants used across middleware, routing, and tooling
- `Config.security`: security defaults (CORS/headers, rate limiting, etc.)
- `Config.middleware`: middleware configuration (ordering/toggles)
- `Config.features`: feature flags
- `Config.secretsManager`: singleton secrets backend configuration

Depending on which adapters/packages you install, you may also have:

- `Config.database`, `Config.cache`, `Config.queue`, `Config.mail`, `Config.storage`, `Config.notification`

## Initialization vs consumption

Most config objects are plain data (optionally constructed from environment variables) and can be read at any time.

Some subsystems are singletons and require explicit initialization during boot:

- `SecretsManager` must be initialized by calling `SecretsManager.getInstance(config)` before first use.

Treat `Config` as the place you _read_ normalized configuration, and use the specific subsystem modules to _initialize_ runtime singletons.

## Environment loading

ZinTrust supports environment-driven configuration (e.g., `.env` in local dev and process env in production). The exact loading strategy depends on your runtime (Node, Deno, Cloudflare). In general:

- Prefer defining configuration via environment variables.
- Use `Config.*` modules to normalize/coerce values (strings → booleans/ints, defaults, required checks).

## Recommended pattern

Centralize initialization in your bootstrap (server start / worker entry) so all code paths see consistent configuration:

```ts
import { Config, SecretsManager } from '@zintrust/core';

export async function boot() {
  SecretsManager.getInstance(Config.secretsManager);
  // ... initialize other optional adapters here
}
```

## Notes

- `Config` is intentionally not a dependency injection container.
- Optional adapters contribute their own config modules; avoid importing adapter-specific config from core-only contexts.
