# Linting & CI Gates

Zintrust projects commonly enforce a small set of “must pass” checks before merging.

## Recommended minimum

- `npm run type-check`
- `npm run lint`
- `npm test`

## Zintrust QA command

Use:

- `zin qa`

It runs lint/type-check/tests/Sonar (as configured) and writes an HTML report.

## Keep it fast

- Prefer unit tests for fast feedback.
- Run heavier suites (coverage/sonar) in CI.
