# Developer Docs Updates

This page tracks developer-visible documentation changes.

## 2026-03-23

- Added [Microservices Runtime Guide](./microservices-runtime-contract.md) to document the generated manifest, runtime hook files, canonical service IDs, standalone service boot, and layered config overrides.
- Clarified that generated services use `routes/api.ts` and `src/bootstrap/service-manifest.ts` as the main runtime entry files developers work with.
- Documented the current implementation status: manifest-based route mounting is in place, standalone Node config layering has started, and Worker-specific service-local config integration is still being extended.
- Documented that scaffolded microservices now generate their own `wrangler.jsonc`, with service-owned aliases kept local and root-owned aliases mapped back to the root project.
- Clarified terminology in the developer docs so Cloudflare Worker runtime, generic serverless runtime, and ZinTrust background workers are described explicitly instead of all being shortened to “worker”.
- Extended that terminology cleanup into broader developer docs including cloud deployment, architecture, worker management, and helpers so Cloudflare Worker runtime and ZinTrust background workers are not conflated.
- Updated the runtime guide to state explicitly that standalone microservice boot code lives in the microservice `src/index.ts`, replaced internal-sounding headings like `Current behavior` and `Current Limits`, and rewrote the remaining runtime work section in developer-facing terms.
- Implemented scaffolded Cloudflare Worker / serverless service-local startup config merging so generated microservice `wrangler.jsonc` files keep root config aliases pointing at the root app while also exposing optional service-local config aliases for layered overrides.
- Moved scaffolded standalone microservice boot ownership into a first-class core start helper so generated service entrypoints delegate runtime setup to framework code instead of hand-wiring `ProjectRuntime.set(...)` themselves.
- Updated generated runtime hook and service manifest files so the built CLI can import source-owned runtime metadata in consumer apps without failing on extensionless local imports, which fixes manifest-backed `zin routes` loading and standalone service boot in freshly scaffolded projects.
- Refreshed the maintainer-facing scaffold runtime fix process note so it documents the implemented core behavior, the dist-package consumer validation, and the remaining need for legacy generated-file normalization.
- Updated CLI service-directory startup env loading so root `.env*` files load first and service-local `.env*` files override them, and added clearer developer guidance for the missing `tsx` runtime dependency during standalone microservice starts.
- Added monolith-only manifest route prefixes for microservices so standalone services keep their native paths while monolith mounting defaults each service to `/<domain>/<name>` unless the manifest overrides the prefix.
- Updated official runtime plugin auto-imports so missing optional ZinTrust adapter packages no longer raise a startup warning in consumer apps, while genuinely broken installed plugin register modules still surface as failures.
- Added explicit standalone microservice env controls so `bootStandaloneService()` and `zin s` can keep root env loading enabled by default, skip it with `rootEnv: false` or `--no-root-env`, and override the inferred microservice env source with `envPath` or `--env-path`.
- Upgraded `simulate/fresh-check` into a generated-style standalone microservice fixture with `src/bootstrap/service-manifest.ts`, `src/zintrust.runtime*.ts`, and a focused simulation test that verifies root `.env` loading plus service-local `.env` overrides from a service-directory context.
- Fixed three runtime regressions in the startup path: root monolith starts now preload service-local `.env` files with service values overriding root duplicates, service-directory `zin s` now boots the standalone service instead of short-circuiting on partially cached runtime metadata, and Worker startup now avoids eager non-default database instantiation that previously triggered Cloudflare PostgreSQL socket failures during boot.
- Fixed the remaining standalone Worker env propagation gap so `zin s --wg` from a microservice directory now injects the merged root-plus-service env set into Wrangler dev bindings, allowing Worker routes to see root values and service overrides consistently in both `Env.get(...)` and static `Env.*` reads.
