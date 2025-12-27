# Changelog

## Unreleased (2025-12-27)

### Security & Reliability

- Add safe plugin installation flow: post-install commands are opt-in via `ZINTRUST_ALLOW_POSTINSTALL=1` and template destinations are validated to prevent path traversal. (PR: TBD)
- Implement graceful shutdown hooks for connection manager to ensure cleanup of intervals and connections on application shutdown. (PR: TBD)
- GenerationCache: add `maxEntries` and LRU-style eviction to prevent unbounded memory growth. (PR: TBD)
- Add CI security workflow and local security scan instructions to `SECURITY.md`. (PR: TBD)

### Tests

- Add integration and unit tests for graceful shutdown, plugin hardening, GenerationCache eviction, and repository hygiene checks (no generated-signature and no logging of secret values).
- Add integration tests for `zin plugin install --package-manager` to cover `pnpm` and `npm` install flows (with mocked package managers).

### Features & Fixes

- Add scheduling subsystem and `log-cleanup` schedule to automatically remove old or excess log files; add `zin logs:cleanup` CLI command to run cleanup on-demand. (PR: TBD)
- Add `--package-manager` flag to `zin plugin install` and support `pnpm`/`yarn`/`npm` in `PluginManager.install`. (PR: TBD)
- Fix `BundleOptimizer` concurrency bug when calculating total sizes by avoiding shared mutable state during concurrent file stats. (PR: TBD)

_For details, see `todo/AUDIT-2025-12-27.md`._
