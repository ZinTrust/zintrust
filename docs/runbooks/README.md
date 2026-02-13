# Queue Reliability Runbooks

This directory contains operator runbooks for queue reliability alerts and failure scenarios in ZinTrust.

## Alert-linked runbooks

- [High job failure rate](./high-job-failure-rate.md)
- [Stalled jobs accumulating](./stalled-jobs-accumulating.md)
- [Queue depth growing](./queue-depth-growing.md)
- [Manual review backlog](./manual-review-backlog.md)

## Core incident runbooks

- [Redis unavailable](./redis-unavailable.md)
- [Database unavailable](./database-unavailable.md)
- [HTTP proxy timeout storm](./http-proxy-timeout-storm.md)
- [Reconciliation lag growth](./reconciliation-lag-growth.md)
- [DLQ spike / poison outbreak](./dlq-spike-poison-outbreak.md)

## Rollout and sign-off

- [Queue reliability rollout checklist](./queue-reliability-rollout-checklist.md)

All runbooks include:

- Immediate containment
- Diagnosis flow
- Rollback plan
- Verification checklist
- Post-incident reconciliation steps
