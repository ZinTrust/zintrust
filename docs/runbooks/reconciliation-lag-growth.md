# Runbook: Reconciliation Lag Growth

## Trigger

- Rising gap between in-memory state and persisted tracker state
- Increasing stale `pending`/`active` records

## Immediate containment

1. Increase reconciliation frequency temporarily.
2. Pause optional background load that competes for DB resources.
3. Keep recovery daemon active for bounded catch-up.

## Diagnosis

1. Measure reconciliation cycle duration vs configured interval.
2. Identify slow queries or table/index pressure on tracking tables.
3. Validate orchestrator timer health and runtime restarts.

## Rollback

1. Revert recent reconciliation query or index changes.
2. Restore previous interval and stale-threshold defaults.
3. Roll back deployments tied to lag increase.

## Verification

1. Lag trend returns to steady state.
2. Stale-record counts reduce to baseline.
3. Transition write throughput remains healthy.

## Post-incident reconciliation

1. Run targeted reconciliation for impacted queues.
2. Confirm active jobs are represented in tracker storage.
3. Capture index/interval tuning decisions with evidence.
