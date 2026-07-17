# Changelog

## 2026-07-17

### Core

- Expand QueryBuilder structured SQL surface (no free-form fragments):
  - `whereExists` / `whereNotExists` + subquery `from` + `whereColumn` / `whereNotNull`
  - Multi-term join ON via `AND` strings or `join(table, (on) => on.on(…))` / `leftJoin`
  - `groupBy(...columns)` with existing allow-listed aggregate `select` expressions
  - `latestPer(partition, { orderBy, alias? })` (`ROW_NUMBER` window wrap for latest-per-group)
  - Join-aware `paginate` totals (`COUNT(DISTINCT <table>.id)` or `countDistinct` option; subquery counts for `groupBy` / `latestPer`)
- Document the APIs with examples in `docs/query-builder.md`, `docs/models.md`, and `docs/security.md`.

## 2026-07-01

### Core

- Fix `performModelSave` dirty-fields snapshot timing: observer-driven and mutator side-effect sibling columns now persist on UPDATE. Previously, `dirtyFields` was captured before `saving`/`updating` observers ran, so any `setAttribute` call inside a pre-persist hook was invisible to the UPDATE persist step. The fix runs observers first, then merges the tracked dirty set with an `attrs`-vs-`original` diff for UPDATE paths. CREATE paths are unaffected (inserts already write the full `attrs` object).

## 2026-06-13

### Core v2.6.0

- Add `WORKER_DRAIN_QUEUES` env allowlist: only the listed queues are drained when set.
- Add `WORKER_DRAIN_EXCLUDE_QUEUES` env denylist: listed queues are always skipped during drain.
- Both vars accept comma-separated queue names and are resolved inside `resolveDrainTargets`.

### queue-monitor v2.4.7

- Add `recoverActiveJob` to `QueueDriver` interface with both BullMQ and Redis-RPC implementations.
- Add `POST /api/recover-active/:queue/:jobId` endpoint to manually recover stale active jobs.
- Add `RecoverActiveJobResult` type (exported from the package public surface).
- Add `QUEUE_MONITOR_RECOVER_ACTIVE_LOCK_MS` env var (default `30000`) to control the BullMQ lock TTL used during recovery.
- Add amber "Recover" button in the dashboard for active jobs; clicking it calls the recover endpoint and reflects the result inline.
- Document new env var in `docs/config-queue.md` and `docs/queue-monitor.md`.

## 2026-02-07

- Add processor spec resolution for URL and file path specs.
- Add worker active status support and inactive filtering.
- Add processor spec validation and cache controls.
