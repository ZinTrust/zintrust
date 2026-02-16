# Job Tracking Persistence

## Overview

ZinTrust queue processing now supports two layers of job lifecycle visibility:

- In-memory tracking for fast runtime introspection
- Optional database persistence for durable audit and recovery visibility

The persistence buffer focuses on enqueue-fallback records (jobs that failed to enqueue into `QUEUE_DRIVER`):

- `pending_recovery` (needs enqueue retry)
- `enqueued` (terminal: job is in `QUEUE_DRIVER` or already exists)

## Runtime Flow

1. App attempts to enqueue a job into `QUEUE_DRIVER`
2. If enqueue fails, `JobStateTracker.pendingRecovery(...)` records a persistence buffer row
3. Recovery daemon retries enqueue for `pending_recovery` rows
4. Once enqueue succeeds (or the job already exists in the queue), status becomes `enqueued` (terminal)

## Automatic Registration

Persistence is auto-wired during queue runtime registration (`registerQueuesFromRuntimeConfig`).

No manual bootstrap code is required when env flags are set correctly.

## Environment Variables

| Key                                        | Default                    | Required | Description                                                             |
| ------------------------------------------ | -------------------------- | -------- | ----------------------------------------------------------------------- |
| `JOB_TRACKING_ENABLED`                     | `true`                     | No       | Enables tracker lifecycle instrumentation.                              |
| `JOB_TRACKING_PERSISTENCE_ENABLED`         | `false`                    | No       | Enables durable persistence writes.                                     |
| `JOB_TRACKING_PERSISTENCE_DRIVER`          | `database`                 | No       | Persistence driver selector. Current supported value: `database`.       |
| `JOB_TRACKING_DB_CONNECTION`               | `default`                  | No       | Database connection name used by persistence adapter.                   |
| `JOB_TRACKING_DB_TABLE`                    | `zintrust_jobs`            | No       | Snapshot table for latest state per job.                                |
| `JOB_TRACKING_DB_TRANSITIONS_TABLE`        | `zintrust_job_transitions` | No       | Append-only transitions table.                                          |
| `JOB_TRACKING_PERSIST_TRANSITIONS_ENABLED` | `true`                     | No       | Persist append-only transitions rows (disable to store only snapshots). |
| `JOB_TRACKING_MAX_JOBS`                    | `20000`                    | No       | In-memory cap for tracked jobs.                                         |
| `JOB_TRACKING_MAX_TRANSITIONS`             | `50000`                    | No       | In-memory cap for transitions.                                          |

## Cleanup schedule

To prevent `zintrust_jobs` and `zintrust_job_transitions` from growing unbounded, ZinTrust includes a built-in schedule:

- `jobTracking.cleanup`

You can override it by exporting a schedule with the same name from `app/Schedules/index.ts`.

Behavior:

- Deletes `zintrust_job_transitions` rows older than `JOB_TRACKING_CLEANUP_RETENTION_DAYS`
- Deletes terminal `zintrust_jobs` rows (`status='enqueued'`) older than the same cutoff
- Uses `withoutOverlapping()` to prevent concurrent cleanup runs

Enable it:

```bash
JOB_TRACKING_CLEANUP_ENABLED=true
JOB_TRACKING_CLEANUP_RETENTION_DAYS=30
JOB_TRACKING_CLEANUP_INTERVAL_MS=21600000
JOB_TRACKING_CLEANUP_MAX_BATCHES=1
```

Run it on-demand:

```bash
zin schedule:run --name jobTracking.cleanup
```

## Database Schema

Use migration:

- `@zintrust/workers/migrations/20260213142000_create_zintrust_job_tracking_tables.ts`

Tables created:

- `zintrust_jobs`
- `zintrust_job_transitions`

## Cloudflare / Node Compatibility

Implementation is runtime-safe:

- Tracker core is runtime-neutral
- Persistence registration is env-gated
- Persistence uses framework database abstractions (no direct Node-only APIs)

## Operational Notes

- If persistence fails, queue processing continues and warning logs are emitted.
- Persistence is best-effort to avoid impacting throughput.
- Disable persistence quickly by setting `JOB_TRACKING_PERSISTENCE_ENABLED=false`.

## Recommended Production Settings

```bash
JOB_TRACKING_ENABLED=true
JOB_TRACKING_PERSISTENCE_ENABLED=true
JOB_TRACKING_PERSISTENCE_DRIVER=database
JOB_TRACKING_DB_CONNECTION=default
JOB_TRACKING_DB_TABLE=zintrust_jobs
JOB_TRACKING_DB_TRANSITIONS_TABLE=zintrust_job_transitions
```

## Validation Checklist

- Migration applied successfully
- Queue runtime boot logs show no persistence warnings
- Failed enqueue jobs appear in `zintrust_jobs` as `pending_recovery`
- State transitions appear in `zintrust_job_transitions`
- Worker failures update `last_error` and transition rows
