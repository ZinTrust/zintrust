# Runbook: Database Unavailable

## Trigger

- Tracker persistence failures
- DB health checks fail or exceed timeout budget

## Immediate containment

1. Protect database by reducing queue write pressure.
2. Keep essential processing paths only.
3. Escalate DB on-call and begin incident bridge.

## Diagnosis

1. Validate DB connectivity, auth, pool saturation, and lock contention.
2. Identify long-running or blocked queries.
3. Check infra events: failover, disk, CPU, memory, IOPS.

## Rollback

1. Revert recent migration/config/query changes.
2. Reduce worker concurrency to safe levels.
3. Route to standby DB if configured.

## Verification

1. DB query latency and error rates return to acceptable range.
2. Tracker writes succeed consistently.
3. Reconciliation lag shrinks to normal.

## Post-incident reconciliation

1. Backfill missing transitions if needed from in-memory traces/logs.
2. Verify terminal state integrity (`completed`, `failed`, `dead_letter`, `manual_review`).
3. Confirm no data loss for accepted jobs.
