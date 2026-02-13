# Runbook: Queue Depth Growing

## Trigger

- Alert: `QueueDepthGrowing`
- Condition: queue depth above `JOB_ALERT_QUEUE_DEPTH_THRESHOLD`

## Immediate containment

1. Throttle producers for low-priority workloads.
2. Increase worker concurrency/replicas for the affected queue.
3. Prioritize high-value jobs and defer non-critical jobs.

## Diagnosis

1. Compare enqueue rate vs completion rate over the same window.
2. Check downstream latency (DB, Redis, HTTP proxy).
3. Identify tenant skew and noisy-neighbor patterns.

## Rollback

1. Roll back recent producer bursts or batching changes.
2. Revert worker changes that reduced throughput.
3. Restore previous queue routing if partitioning regressed.

## Verification

1. Queue depth trend reverses and remains under threshold.
2. End-to-end completion latency returns to SLO target.
3. Error/timeout rates remain stable during drain.

## Post-incident reconciliation

1. Confirm no orphan jobs in pending states.
2. Review delayed retries to prevent secondary backlog spikes.
3. Update capacity model and autoscaling thresholds.
