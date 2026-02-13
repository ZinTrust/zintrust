# Runbook: Stalled Jobs Accumulating

## Trigger

- Alert: `StalledJobsAccumulating`
- Condition: `stalled` jobs exceed `JOB_ALERT_STALLED_THRESHOLD`

## Immediate containment

1. Confirm reliability orchestrator is running (`JOB_RELIABILITY_ENABLED=true`).
2. Scale worker replicas to clear lock/heartbeat starvation.
3. Temporarily increase job timeout only if jobs are validly long-running.

## Diagnosis

1. Validate heartbeat cadence (`JOB_HEARTBEAT_INTERVAL_MS`, `JOB_HEARTBEAT_GRACE_MS`).
2. Check worker crash/restart patterns and resource exhaustion.
3. Inspect lock contention and dedup lock expiration behavior.

## Rollback

1. Roll back worker changes affecting heartbeat, lock, or timeout behavior.
2. Revert queue concurrency changes that introduced starvation.
3. Restore prior known-good lock timing configuration.

## Verification

1. Stalled count decreases consistently for 10+ minutes.
2. Recovery daemon re-queues valid jobs and terminal statuses remain bounded.
3. No repeated stall loops for same job IDs.

## Post-incident reconciliation

1. Reconcile `active` vs persisted states for affected queues.
2. Move irrecoverable signatures to manual review or DLQ.
3. Capture incident-specific threshold tuning changes and rationale.
