# Architecture Boundaries

Zintrust projects typically follow a “minimal core + adapters” approach.

## Core vs packages

- `src/` is the framework core.
- `packages/` contains optional adapters/drivers (db/cache/queue/mail/storage).

## Why it matters

- Keeps the core small and stable.
- Avoids forcing heavy dependencies on every install.
- Makes security posture easier to reason about.
