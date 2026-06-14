# Changelog

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
