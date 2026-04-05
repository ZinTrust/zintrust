# Microservices Runtime Guide

This page documents the developer-facing runtime model for ZinTrust microservices.

Use it when you need to:

1. understand which files ZinTrust reads at boot
2. mount service routes into a monolith runtime
3. run a service as a standalone entrypoint
4. add service-local config overrides without forking the whole project config

## Terminology

This guide uses the following terms deliberately:

1. Node runtime: a normal long-lived server process started with ZinTrust in Node.js.
2. Cloudflare Worker / serverless runtime: a serverless request runtime started through Wrangler or deployed to Cloudflare Workers.
3. Serverless runtime: a general category that includes platforms such as Cloudflare Workers and AWS Lambda.
4. ZinTrust worker: a background job worker from the ZinTrust workers system, not the same thing as a Cloudflare Worker.

When this guide says `src/zintrust.runtime.wg.ts`, it means the runtime module used for the Cloudflare Worker / serverless runtime, not a ZinTrust background worker.

## Runtime Model

ZinTrust supports two execution styles from the same repository:

1. monolith mode, where the root runtime mounts selected services
2. standalone mode, where one service boots with its own runtime context

The runtime source of truth is a generated manifest, not ad hoc filesystem discovery.

## Files You Work With

The current runtime contract uses these files:

```text
src/bootstrap/service-manifest.ts
src/zintrust.runtime.ts
src/zintrust.runtime.wg.ts
src/services/<domain>/<name>/routes/api.ts
src/services/<domain>/<name>/src/index.ts
src/services/<domain>/<name>/wrangler.jsonc
```

What each file does:

1. `src/bootstrap/service-manifest.ts` lists services that can be mounted by the root runtime.
2. `src/zintrust.runtime.ts` exposes the runtime module for Node.
3. `src/zintrust.runtime.wg.ts` exposes the runtime module for the Cloudflare Worker / serverless runtime, for example when running with Wrangler or deploying to Cloudflare Workers.
4. `routes/api.ts` is the generated route module for a service.
5. `src/index.ts` is the standalone service entrypoint.
6. `wrangler.jsonc` is the service-local Cloudflare Worker config for that microservice.

## Service Identity

Every service has a canonical ID in `domain/name` form.

Examples:

- `ecommerce/users`
- `ecommerce/orders`
- `billing/payments`

ZinTrust normalizes internal lookups to this format. Bare names can still work when they are unambiguous, but developer-facing config and diagnostics should prefer the canonical ID.

When `.zintrust.json` exists at the project root, scaffolded services also register that canonical ID under `cloudflare.targets` automatically. That keeps Cloudflare secret selection aligned with the same service ID used by the runtime manifest and service-local `wrangler.jsonc` files.

Example:

```json
{
  "cloudflare": {
    "shared_env": ["APP_KEY", "JWT_SECRET", "SESSION_SECRET"],
    "targets": {
      "worker": [],
      "ecommerce/users": []
    }
  }
}
```

Add service-specific secret keys to that target when the service needs extra Cloudflare Worker secrets beyond the shared set.

## Service Manifest

The root runtime reads service definitions from `src/bootstrap/service-manifest.ts`.

Example:

```ts
import type { ServiceManifestEntry } from '@zintrust/core';

export const serviceManifest: ReadonlyArray<ServiceManifestEntry> = [
  {
    id: 'ecommerce/users',
    domain: 'ecommerce',
    name: 'users',
    prefix: 'ecommerce/users',
    loadEnv: false,
    port: 3001,
    monolithEnabled: true,
    loadRoutes: async () =>
      import('../services/ecommerce/users/routes/api.ts').catch(
        () => import('../services/ecommerce/users/routes/api.js')
      ),
  },
];

export default serviceManifest;
```

Why `loadRoutes()` is used:

1. it keeps route imports explicit
2. it works cleanly with Node and Cloudflare Worker bundling
3. it avoids relying on string-based runtime module resolution
4. it lets the built CLI load source `.ts` routes in consumer apps and fall back to built `.js` routes after compilation

The generated `src/zintrust.runtime.ts` and `src/zintrust.runtime.wg.ts` files follow the same pattern for `src/bootstrap/service-manifest.ts`, so the runtime metadata remains loadable both from source and from build output.

Monolith mounting also uses the manifest prefix:

1. `prefix` affects monolith route mounting only
2. `loadEnv` affects monolith service env preloading only
3. standalone service boot keeps the service routes unchanged
4. if `prefix` is omitted, ZinTrust defaults it to `domain/name`
5. developers can override `prefix` to any mount path they want

For env loading:

1. `loadEnv` defaults to `true`
2. when `loadEnv` is `true`, monolith startup preloads the service-local `.env*` layer before mounting that service
3. when `loadEnv` is `false`, the service still mounts in monolith mode, but ZinTrust skips service-local `.env*` loading for that manifest entry
4. scaffolded service manifest entries default to `loadEnv: false` so mounted services do not participate in root/global env merging unless you opt in explicitly

## Monolith Route Mounting

When the root runtime boots, ZinTrust loads `src/zintrust.runtime.ts`, reads the manifest, and mounts route modules whose entries have `monolithEnabled !== false`.

In Node monolith mode, ZinTrust also preloads each service-local `.env*` layer by default before mounting that service. Developers can disable that per service with `loadEnv: false` in the manifest entry.

By default, duplicate keys from a mounted service env layer still override the root value during monolith preload. If you want the root app to stay authoritative while still filling missing service values, set `RUN_AS_MONOLITH=true` before starting the root runtime. With that flag enabled, ZinTrust keeps the root env value for duplicate keys and only pulls missing keys from the service-local env layer.

Generated services standardize on:

```text
src/services/<domain>/<name>/routes/api.ts
```

That route module should export `registerRoutes(router)`.

## Standalone Service Boot

Generated standalone service entrypoints now delegate standalone boot ownership to a core start helper.

The framework-owned standalone boot step is used for:

1. identifying the active service at runtime
2. resolving service-local config overrides
3. starting the Node runtime when the entrypoint is executed directly
4. keeping standalone boot aligned with the same runtime primitives used by the root application

For a scaffolded microservice, this entrypoint lives in the microservice root at:

```text
src/services/<domain>/<name>/src/index.ts
```

It is not the root project entrypoint at `src/index.ts`.

The generated microservice entrypoint looks like this in principle:

```ts
import { bootStandaloneService } from '@zintrust/core/start';

await bootStandaloneService(import.meta.url, {
  id: 'ecommerce/users',
  domain: 'ecommerce',
  name: 'users',
  configRoot: 'src/services/ecommerce/users/config',
});

export { default } from '@zintrust/core/start';
```

The important point is that the microservice entrypoint no longer owns the raw runtime setup itself. It delegates that work to core.

Example:

1. standalone service route module defines `GET /`
2. standalone service responds at `/`
3. monolith mounts the same route at `/<prefix>`

With the default generated manifest entry for `ecommerce/users`, that means:

1. standalone: `/`
2. monolith: `/ecommerce/users`

If a service route does not appear in monolith mode, check these first:

1. the service is listed in `src/bootstrap/service-manifest.ts`
2. `monolithEnabled` is not `false`
3. `loadRoutes()` resolves the service route module successfully
4. the root runtime can load `src/zintrust.runtime.ts`

## Env Handling For Standalone Services

When you start a generated service from its own folder, for example:

```bash
cd src/services/ecommerce/users
zin s
```

ZinTrust treats env in two layers:

1. the project root env files are loaded first
2. the service directory env files are loaded after that

If both layers define the same key, the microservice layer wins.

For a service at:

```text
src/services/ecommerce/users
```

the effective lookup paths are:

1. `<project-root>/.env`
2. `<project-root>/.env.local`
3. `<project-root>/.env.<mode>` when the mode is not `production`
4. `<project-root>/.env.<mode>.local`
5. `<project-root>/src/services/ecommerce/users/.env`
6. `<project-root>/src/services/ecommerce/users/.env.local`
7. `<project-root>/src/services/ecommerce/users/.env.<mode>` when the mode is not `production`
8. `<project-root>/src/services/ecommerce/users/.env.<mode>.local`

Example:

```text
/workspace/my-zintrust-app/.env
/workspace/my-zintrust-app/src/services/ecommerce/users/.env
```

If both files define the same key, the service-local value wins for a service-directory start.

This gives you the usual shared-app defaults from the root project and lets the microservice override only the values it needs locally.

`bootStandaloneService()` now exposes explicit env controls when you want to override the default directory inference:

```ts
import { bootStandaloneService } from '@zintrust/core/start';

await bootStandaloneService(import.meta.url, {
  id: 'ecommerce/users',
  domain: 'ecommerce',
  name: 'users',
  configRoot: 'src/services/ecommerce/users/config',
  rootEnv: true,
  envPath: 'config/env/microservices/users/.env.local',
});
```

Rules:

1. `rootEnv` defaults to `true`
2. when `rootEnv` is `true` or omitted, ZinTrust loads the root project env first
3. when `rootEnv` is `false`, ZinTrust skips the root project env layer
4. when `envPath` is provided, ZinTrust uses that explicit env directory or `.env` file instead of inferring the microservice env directory
5. relative `envPath` values are resolved from the project root, while absolute paths are used as-is

If `envPath` is omitted, ZinTrust falls back to the inferred service env directory.

The CLI mirrors this with explicit flags:

1. `zin s --env-path config/env/microservices/users/.env.local`
2. `zin s --no-root-env`

Runtime file resolution still uses `ZINTRUST_PROJECT_ROOT`, so these project-owned files are resolved from the application root even when the command is launched inside a service directory:

1. `src/zintrust.runtime.ts`
2. `src/zintrust.runtime.wg.ts`
3. root `config/*.ts`
4. other project-relative runtime loaders

Practical rule for developers:

1. put shared defaults in the root `.env`
2. put service-specific overrides in the service directory `.env`
3. use `envPath` when you want the microservice env source to be explicit instead of inferred
4. set `rootEnv: false` only when the service must not inherit root env defaults
5. use service-local `config/*.ts` only when you need code-level config overrides, not plain env overrides

For root monolith starts, use `RUN_AS_MONOLITH=true` when service-local env files should act as gap-fillers instead of overriding duplicate root keys.

If `zin s` fails with `Error: 'tsx' not found on PATH.`, install `tsx` in the project with `npm install -D tsx`.

If you need a machine-wide fallback for ad hoc development, `npm install -g tsx` also works, but the project-local dependency is the safer default.

## Layered Config Overrides

Standalone services can override selected config modules without duplicating the whole root config tree.

Resolution order is:

1. root config override in `config/<name>.ts`
2. service-local override in `src/services/<domain>/<name>/config/<name>.ts`
3. service-local values override root values when both exist

Example layout:

```text
config/cache.ts
src/services/ecommerce/users/config/cache.ts
```

This lets a service start with shared project defaults and only add local overrides where needed.

Supported today:

1. Node runtime supports merged root plus service-local startup config overrides.
2. Cloudflare Worker / serverless runtime also supports merged root plus service-local startup config overrides for scaffolded standalone services.

## Cloudflare Worker / Serverless Runtime

The Cloudflare Worker / serverless runtime uses the static runtime hook and manifest instead of runtime filesystem discovery.

Today that means:

1. `src/zintrust.runtime.wg.ts` is the Cloudflare Worker / serverless runtime entry module
2. the generated manifest remains the source of truth for service mounting
3. each scaffolded service gets its own `wrangler.jsonc`
4. aliases that belong to the root application still point back to the root project

### Service-local Wrangler layout

Each scaffolded service now gets:

```text
src/services/<domain>/<name>/wrangler.jsonc
```

That file keeps service-owned paths local, including:

1. `main`
2. `@routes/api.ts`
3. `@service-runtime-config/*` aliases for optional service-local startup config modules
4. Cloudflare Worker / serverless vars such as `SERVICE_NAME`, `SERVICE_DOMAIN`, and `SERVICE_PORT`

Aliases that belong to the root application still resolve to the root project, including:

1. `../zintrust.runtime.wg.js`
2. `../zintrust.plugins.wg.js`
3. `@runtime-config/*`

This keeps the service Cloudflare Worker / serverless config small while ensuring shared runtime and config modules still come from the root app.

## Scaffolding Behavior

When you scaffold a service, ZinTrust now:

1. creates or updates `src/bootstrap/service-manifest.ts`
2. creates `src/zintrust.runtime.ts` and `src/zintrust.runtime.wg.ts` if they do not exist
3. generates `routes/api.ts` for the service
4. generates a service-local `wrangler.jsonc`
5. generates a standalone entrypoint that delegates service runtime setup to core

## Recommended Developer Workflow

For most teams, the intended flow is:

1. scaffold a service
2. implement routes in `routes/api.ts`
3. keep the service listed in `src/bootstrap/service-manifest.ts` when it should mount in monolith mode
4. add service-local override files only for config that actually needs to diverge

## Summary

The runtime contract is meant to stay simple for developers:

1. manifest for service registration
2. runtime hook for boot-time integration
3. `domain/name` for service identity
4. `routes/api.ts` for service-owned routes
5. optional service-local config overrides when standalone behavior needs to diverge between Node runtime and Cloudflare Worker / serverless runtime
