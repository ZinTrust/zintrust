# Runbook: High Job Failure Rate

## Trigger

- Alert: `HighJobFailureRate`
- Condition: queue failure rate above `JOB_ALERT_FAILURE_RATE_THRESHOLD`

## Immediate containment

1. Reduce producer pressure for affected queues (rate-limit ingress).
2. Pause non-critical workers and keep critical workers active.
3. Enable/verify circuit breaker behavior for unstable downstream dependencies.

## Diagnosis

1. Inspect `QueueReliabilityMetrics.dashboardSnapshot()` for `failed`, `deadLetter`, and `manualReview`.
2. Review recent `JobStateTracker` transitions for common `reason` and `lastErrorCode` values.
3. Correlate spikes with deploy/version (`workerVersion`) and dependency incidents.

## Rollback

1. Roll back worker release if failure signature started immediately after deploy.
2. Revert dependency config changes (timeouts, proxy URL, credentials) when implicated.
3. Disable newly introduced retry logic that amplifies failures.

## Verification

1. Failure rate drops below threshold for 15 minutes.
2. `deadLetter` growth flattens.
3. Throughput (`completed`) recovers to baseline.

## Post-incident reconciliation

1. Run controlled DLQ replay with reason code `bug_fixed` or `transient_dependency`.
2. Verify replay outcomes and audit lineage (`originalJobId`, replay metadata).
3. Document root cause and add regression test coverage.
