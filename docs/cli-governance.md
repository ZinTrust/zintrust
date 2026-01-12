# CLI Governance

The ZinTrust CLI is designed to keep teams aligned on:

- consistent naming
- consistent file layout
- consistent defaults for routes/controllers/middleware
- a single “blessed” QA workflow

CLI entrypoints (from `package.json`):

- `zintrust` (full command)
- `zin` (shortcut)
- `z` and `zt` (shortcuts)

All of them execute the same implementation (`bin/zintrust-main.ts` → `src/cli/CLI.ts`).

## Why the CLI is part of governance

When codebases scale, governance breaks down most often because:

- people create different folder layouts
- patterns drift across teams
- “best practice” is tribal knowledge

The ZinTrust CLI makes the desired patterns easy and repeatable.

## QA: the one-command quality gate

The primary governance command is:

- `zin qa`

Implemented in `src/cli/commands/QACommand.ts`.

### What it runs

`zin qa` orchestrates the same checks you’d run manually:

- `npm run lint`
- `npm run type-check`
- `npm run test:coverage`
- `npm run sonarqube` (unless disabled)

It always writes a report into `coverage/` and opens it by default.

Common usage:

- `zin qa --no-open` for CI
- `zin qa --no-sonar` when SonarQube is not configured

## Scaffolding: prefer generators over hand-rolled files

Use generators when possible so:

- imports match the project’s ESM + alias conventions
- default patterns stay consistent across contributors
- templates can evolve without teams re-learning structure

The main scaffolding entrypoint is:

- `zin add <type> [name]`

See `src/cli/commands/AddCommand.ts`.

Supported `type` values include (see CLI help for the canonical list):

- `service`, `feature`
- `migration`, `model`, `controller`, `routes`
- `factory`, `seeder`, `workflow`
- `governance`

Many subcommands support interactive prompts by default; use `--no-interactive` to enforce fully scripted runs.

## Practical team rules

- Treat `zin add ...` as the default way to create new components.
- Keep CI scripts calling the same commands developers run locally.
- When you need a new standard pattern, add it to CLI scaffolding so the whole org benefits.
