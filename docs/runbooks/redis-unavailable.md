# Runbook: Redis Unavailable

## Trigger

- Redis ping/connect failures
- Queue enqueue/dequeue operations timing out

## Immediate containment

1. Switch to degraded mode: persist state and avoid destructive retries.
2. Reduce producer load to prevent uncontrolled backlog growth.
3. Escalate to platform/SRE if outage exceeds 5 minutes.

## Diagnosis

1. Validate network path, DNS, TLS, and credentials.
2. Confirm Redis memory pressure, eviction, and connection limits.
3. Check deployment/network changes near outage start.

## Rollback

1. Revert recent Redis config/network changes.
2. Fail over to healthy Redis endpoint/cluster.
3. Restart workers only after Redis health stabilizes.

## Verification

1. Redis command latency and error rates normalize.
2. Recovery daemon drains `pending_recovery` without spike in failures.
3. Queue depth trend returns to baseline.

## Post-incident reconciliation

1. Reconcile jobs accepted during outage against persisted tracker state.
2. Replay recoverable dead-letter entries with governed reason codes.
3. Document impact window and recovery evidence.
