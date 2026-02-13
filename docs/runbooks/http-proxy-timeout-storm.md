# Runbook: HTTP Proxy Timeout Storm

## Trigger

- Spike in queue HTTP proxy timeout errors
- Elevated `pending_recovery` entries after enqueue attempts

## Immediate containment

1. Increase producer retry spacing to reduce synchronized retries.
2. Shift traffic away from unhealthy proxy instances.
3. Lower non-critical enqueue rates.

## Diagnosis

1. Check proxy latency distribution and upstream saturation.
2. Validate timeout settings (`QUEUE_HTTP_PROXY_TIMEOUT_MS`, retry params).
3. Correlate with network incidents and deployment changes.

## Rollback

1. Roll back recent proxy routing/auth/signing changes.
2. Restore prior timeout/retry profile.
3. Disable problematic middleware on gateway route.

## Verification

1. Timeout ratio declines to baseline.
2. `pending_recovery` queue drains without elevated dead letters.
3. End-to-end enqueue SLO recovers.

## Post-incident reconciliation

1. Re-run recovery daemon and verify recovered job completion.
2. Audit replayed or recovered jobs with actor/reason metadata.
3. Tune proxy capacity and retry jitter policy.
