# Linting & CI Gates

ZinTrust projects commonly enforce a small set of “must pass” checks before merging.

This repo is set up so the same checks can run:

- locally (fast feedback)
- in CI (merge gating)

## Recommended minimum gates

These are the baseline checks most ZinTrust repos should require:

- `npm run lint` (ESLint)
- `npm run type-check` (TypeScript compiler)
- `npm test` (Vitest)

These scripts are defined in `package.json`.

## The unified gate: `zin qa`

ZinTrust includes a unified QA command (`src/cli/commands/QACommand.ts`):

- `zin qa`

It runs (in order):

- `npm run lint`
- `npm run type-check`
- `npm run test:coverage` (note: this is coverage, not `npm test`)
- `npm run sonarqube` unless `--no-sonar` is provided

It always writes a report:

- `coverage/qa-report.html`
- `coverage/qa-report.css`

And it opens the report in the default browser unless `--no-open` is set.

Recommended CI invocation:

```bash
zin qa --no-open --no-sonar
```

Enable SonarQube in CI only when you have tokens/config wired.

## Build-level gates

This repo’s `npm run build` is intentionally strict. It includes:

- `npm test`
- `npm run templates:check`
- TypeScript compilation + alias fixups + dist packaging steps

In CI, `npm run build:ci` skips tests by default but still ensures the dist build is coherent.

Practical recommendation:

- PR gate: lint + type-check + tests
- main branch gate: `build` and/or `zin qa` with Sonar enabled

## Duplication gate (optional, but useful)

This repo includes a staged-file duplication check:

- `npm run duplication:check`

Implementation is in `scripts/ci/duplication-check.mjs` and uses `jscpd` against staged files.

This is a good gate for teams that want to prevent copy/paste growth without scanning the entire repository on every PR.

Environment knobs:

- `DUPLICATION_THRESHOLD` (default `5`)
- `DUPLICATION_MIN_LINES` (default `5`)
- `DUPLICATION_MIN_TOKENS` (default `70`)

## Keep it fast (local) vs strict (CI)

Tips:

- Run `npm test` locally for fast feedback.
- Run `npm run test:coverage` in CI where the runtime cost is acceptable.
- Use `zin qa --no-open` to avoid interactive behavior.
- Keep heavy/static analysis (SonarQube) configurable and opt-in per environment.
