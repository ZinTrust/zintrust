# Queue Reliability Rollout Checklist (Production Sign-off)

Use this checklist to complete final rollout sign-off for queue reliability controls.

## Release metadata

- Release version:
- Release date:
- Approver:
- Incident commander:

## Technical readiness

- [ ] Reliability orchestrator enabled in target environment.
- [ ] Job tracking persistence enabled and validated.
- [ ] Recovery and reconciliation intervals validated under load.
- [ ] DLQ replay governance controls validated (reason code, actor allow-list, batch/QPS caps).
- [ ] Dashboard snapshot and runbook links verified.

## Alert and runbook readiness

- [ ] `HighJobFailureRate` alert mapped and tested.
- [ ] `StalledJobsAccumulating` alert mapped and tested.
- [ ] `QueueDepthGrowing` alert mapped and tested.
- [ ] `ManualReviewBacklog` alert mapped and tested.
- [ ] Core incident runbooks drilled (Redis, DB, proxy timeout, reconciliation lag, DLQ spike).

## Data protection and compliance

- [ ] Sensitive field redaction checks passed for payload/error/result.
- [ ] Retention policy and purge tasks validated.
- [ ] Replay/manual actions produce auditable trail.

## Validation evidence

- [ ] Unit tests green for reliability modules.
- [ ] Chaos scenario evidence attached (worker crash, timeout, Redis outage).
- [ ] Node + Workers compatibility checks completed (`zin s` and `zin s --wg`).

## Sign-off

| Role                | Name | Date | Status  |
| ------------------- | ---- | ---- | ------- |
| Backend Lead        |      |      | Pending |
| SRE                 |      |      | Pending |
| Security            |      |      | Pending |
| QA                  |      |      | Pending |
| Engineering Manager |      |      | Pending |

## Exit criteria

- All checklist items are complete and evidence links are attached.
- No P1/P2 unresolved reliability risks remain.
- On-call handoff and escalation contacts are confirmed.
