# Changelog

## Unreleased (2025-12-27)

### Security & Reliability

- Add safe plugin installation flow: post-install commands are opt-in via `ZINTRUST_ALLOW_POSTINSTALL=1` and template destinations are validated to prevent path traversal. (PR: TBD)
- Implement graceful shutdown hooks for connection manager to ensure cleanup of intervals and connections on application shutdown. (PR: TBD)
- GenerationCache: add `maxEntries` and LRU-style eviction to prevent unbounded memory growth. (PR: TBD)
- Add CI security workflow and local security scan instructions to `SECURITY.md`. (PR: TBD)

### Tests

- Add integration and unit tests for graceful shutdown, plugin hardening, GenerationCache eviction, and repository hygiene checks (no generated-signature and no logging of secret values).

_For details, see `todo/AUDIT-2025-12-27.md`._
