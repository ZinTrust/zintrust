# Runbook: DLQ Spike / Poison Message Outbreak

## Trigger

- Sudden growth of `dead_letter` records
- Repeated failures with matching payload/error signature

## Immediate containment

1. Suspend replay for suspect signature classes.
2. Enable quarantine policy for repeating signatures.
3. Keep critical queue classes isolated from poison traffic.

## Diagnosis

1. Group DLQ entries by normalized failure signature.
2. Identify schema drift, dependency contract changes, or bad producer payloads.
3. Confirm whether issue is transient or deterministic.

## Rollback

1. Roll back producer/worker release introducing bad payload shape.
2. Revert dependency changes causing deterministic processing failure.
3. Disable affected feature path until guardrails are in place.

## Verification

1. DLQ growth stops for quarantined signatures.
2. Controlled replay of fixed signatures succeeds within acceptable failure budget.
3. No hot-loop retries observed for same signature.

## Post-incident reconciliation

1. Replay with reason code `bug_fixed` after fix verification.
2. Audit lineage for all replayed jobs.
3. Add regression tests and quarantine signature defaults.
