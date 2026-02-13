# Runbook: Manual Review Backlog

## Trigger

- Alert: `ManualReviewBacklog`
- Condition: `manual_review` jobs exceed `JOB_ALERT_MANUAL_REVIEW_THRESHOLD`

## Immediate containment

1. Freeze automatic replay for unknown signatures.
2. Triage by queue/business criticality.
3. Assign on-call + domain owner for adjudication.

## Diagnosis

1. Cluster jobs by error signature and producer source.
2. Determine if signature is transient, data-quality, or code defect.
3. Validate data protection requirements before replay/export.

## Rollback

1. Disable faulty producer/job type if backlog is defect-driven.
2. Roll back recent schema or payload changes.
3. Stop replay path if it increases failures.

## Verification

1. Backlog decreases to steady-state target.
2. Replayed jobs complete without elevated failure rates.
3. Audit trail includes reason code and actor for each replay.

## Post-incident reconciliation

1. Add quarantine signatures for repeated poison patterns.
2. Add or update replay policy reason-code guidance.
3. Record follow-up tasks for automation gaps.
