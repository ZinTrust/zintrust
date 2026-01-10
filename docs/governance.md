# Governance

Governance is how ZinTrust projects keep **quality, security, and consistency** high as the codebase grows and more people contribute.

ZinTrust bakes governance into:

- CLI workflows (standardized commands that teams can agree on)
- CI gates (a predictable “must pass” set)
- scaffolding/generators (consistent file layout and defaults)

This page focuses on the “what and why”. For the concrete command list and CI wiring, see `docs/linting-ci-gates.md`.

## What governance means in a ZinTrust repo

In practice, governance is a set of rules you can automate:

- **Correctness**: type-check and tests
- **Consistency**: lint + formatting conventions
- **Maintainability**: duplication checks, template checks, architectural boundaries
- **Security posture**: secure-by-default config, least-privilege patterns, safe scaffolds

The important part is not the exact tool choice, but that the checks are:

- easy to run locally
- deterministic in CI
- hard to bypass accidentally

## The canonical QA workflow: `zin qa`

ZinTrust ships a unified QA command implemented in `src/cli/commands/QACommand.ts`.

The shortcut binaries are:

- `zintrust` (full)
- `zin` (short)
- `z` / `zt` (shortcuts)

### What `zin qa` actually does

`zin qa` runs the following (via npm scripts):

- `npm run lint`
- `npm run type-check`
- `npm run test:coverage` (note: coverage, not just `npm test`)
- `npm run sonarqube` (unless disabled)

It then generates a QA report:

- `coverage/qa-report.html`
- `coverage/qa-report.css`

And (by default) opens the report in your browser.

### Useful flags

- `zin qa --no-sonar` to skip SonarQube analysis
- `zin qa --no-open` to avoid opening a browser window in CI

## Why “single command QA” matters

Having one blessed “team workflow” reduces governance friction:

- onboarding is faster (one command to learn)
- CI and local runs match
- PR reviews focus on product changes, not style/tooling debates

## How this repo keeps governance maintainable

ZinTrust tries to keep checks:

- **fast by default** for local loops
- **stricter in CI** (where runtime is acceptable)

Examples in this repo include:

- `templates:check` to ensure generated/template imports stay valid
- duplication checks for staged files (`scripts/ci/duplication-check.mjs`)

## Recommended team policies

These are policies that typically work well for teams using ZinTrust:

- Require passing: `lint`, `type-check`, `test` for every PR.
- Run heavier checks (coverage, SonarQube) on main branch or nightly.
- Treat the CLI scaffolding as “source of truth” for structure and patterns.
- Keep architectural boundaries explicit (see `docs/architecture-boundaries.md`).
