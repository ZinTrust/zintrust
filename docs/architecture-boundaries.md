# Architecture Boundaries

ZinTrust projects follow a “minimal core + optional adapters” approach.

The goal is to keep the framework core small and stable while letting applications opt into heavier integrations (databases, queues, mail providers, storage backends) only when needed.

This page explains the **intended dependency direction** and where code should live.

## Key directories and what belongs where

### `src/` — framework core

`src/` is the core runtime and framework implementation.

Core principles:

- keep dependencies minimal
- prefer stable interfaces and sealed modules (many exports use `Object.freeze({ ... })`)
- avoid app-specific concerns

### `app/` — application code (controllers, middleware, models)

`app/` is where _your service logic_ lives in a typical ZinTrust project layout.

Examples:

- controllers (HTTP endpoints)
- custom middleware
- domain models
- service-layer code

### `routes/` — route registration

`routes/` is where routes are defined and registered.

The router layer is intentionally thin: it should wire handlers and middleware, not contain business logic.

### `packages/` — optional adapters/drivers

`packages/` contains on-demand adapters (db/cache/queue/mail/storage, etc.).

The core should not require these packages. Projects include them only when needed.

### `bin/` — CLI entrypoints

`bin/` contains the CLI entrypoints (`zintrust`, `zin`, `z`, `zt`). These are thin wrappers around the actual CLI implementation.

## Dependency direction (the rule of thumb)

Keep dependencies flowing “outward”:

- `src/` must not depend on `app/` or any specific service code.
- `app/` depends on `src/` (core APIs) and optionally on adapters.
- `routes/` depends on `app/` and `src/`.
- adapters under `packages/` plug into core registries, but the core should still run without them.

This prevents circular dependencies and keeps the core reusable.

## Optional adapters via plugins

ZinTrust supports installing optional integrations via the plugin system.

The plugin tooling (see `src/runtime/PluginManager.ts`) can:

- install packages with your chosen package manager
- copy template files into your project
- write `src/zintrust.plugins.ts` containing **side-effect imports** that register adapters

That auto-import file is explicitly managed by the CLI and is designed to make “optional but discoverable” integrations easy.

## Node builtin wrappers: `src/node-singletons/`

ZinTrust uses wrappers for Node built-ins (e.g. fs/path/http) under `src/node-singletons/`.

This helps keep ESM imports consistent and makes it easier to centralize environment-specific behavior.

Guideline:

- prefer `@node-singletons/*` imports over importing Node built-ins directly in framework code

## Practical examples

- A DB driver belongs in `packages/db/...` (optional install), not in `src/`.
- A payment provider integration belongs in `app/` (application concern), not in `src/`.
- Route wiring belongs in `routes/` and should call into controllers/services.

## Why boundaries matter

Keeping these boundaries clean:

- reduces install size and supply-chain exposure
- makes upgrades safer (core changes don’t ripple everywhere)
- keeps CI faster (less dependency churn)
- makes security posture easier to reason about (what’s “core” vs “optional” is explicit)
