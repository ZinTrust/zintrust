# Generators (CLI Scaffolding)

ZinTrust uses CLI generators to keep projects consistent across teams: folder layout, import style (ESM + aliases), and default patterns are all produced by the same scaffolding code.

The main entrypoints are:

- `zin new <name>` — scaffold a new project
- `zin add <type> [name]` — add components to an existing project

Most generators are interactive by default; add `--no-interactive` for CI / scripted runs.

## `zin add` — add components

The `add` command supports these canonical `type` values:

- `service`
- `feature`
- `migration`
- `model`
- `controller`
- `routes`
- `factory`
- `seeder`
- `requestfactory`
- `responsefactory`
- `workflow`
- `governance`

### Common options

- `--no-interactive` — disable prompts (required for deterministic automation)
- `--package-manager <pm>` — used when installing plugin-style adapters (`npm|yarn|pnpm`)

### Service generator

Creates an in-project service scaffold (folders + starter code).

Key options:

- `--domain <name>`
- `--port <number>`
- `--database <shared|isolated>`
- `--auth <api-key|jwt|none|custom>`

Example:

```bash
zin add service users --domain ecommerce --port 3001 --database shared --auth api-key --no-interactive
```

### Feature generator

Adds a feature module into an existing service path.

Key options:

- `--service <path>` — the service root directory path (relative to project root)
- `--with-test` — generate an accompanying test

Example:

```bash
zin add feature auth --service src/services/ecommerce/users --with-test --no-interactive
```

### Controller generator

Creates a controller file.

Key option:

- `--controller-type <crud|resource|api|graphql|websocket|webhook>`

Example:

```bash
zin add controller UserController --controller-type resource --no-interactive
```

### Model generator

Creates an ORM model.

Key options:

- `--soft-delete`
- `--timestamps` (timestamps are enabled by default; use interactive prompts to disable)

Example:

```bash
zin add model User --soft-delete --no-interactive
```

### Migration generator

Creates one or more migration files.

Example:

```bash
zin add migration create_users_table --no-interactive
```

### Routes generator

Creates a new route group file.

Key option:

- `--resource` — scaffold resource-style routes

Example:

```bash
zin add routes api --no-interactive
```

### Factory and seeder generators

Factories and seeders can be parameterized.

Common options:

- `--model <ModelName>`
- `--relationships <csv>`

Seeder options:

- `--count <number>`
- `--states`
- `--truncate`

### Workflow generator

Scaffolds CI/CD workflow templates.

Key options:

- `--platform <lambda|fargate|cloudflare|deno|all>`
- `--branch <name>`
- `--node-version <version>`

### Governance installer

`zin add governance` installs governance tooling (lint + architecture tests) into an existing project.

## Plugin-style installs: `zin add <domain>:<driver>`

ZinTrust supports planned modular adapter installs via the `domain:driver` syntax.

Examples:

```bash
zin add db:sqlite
zin add queue:redis
zin add broadcast:redis
zin add mail:nodemailer
```

Use `--package-manager` to control the installer:

```bash
zin add db:sqlite --package-manager pnpm
```

## `zin new` — scaffold a project

`zin new` generates a new project directory with a selected template and baseline configuration.

Options include:

- `--template <basic|api|microservice|fullstack>`
- `--database <sqlite|mysql|postgresql|d1-remote>`
- `--port <number>`
- `--no-git` / `--no-install`
- `--package-manager <npm|yarn|pnpm>`
- `--governance`
- `--no-interactive`

Example (fully scripted):

```bash
zin new my-app --template api --database postgresql --port 7777 --governance --no-interactive
```

## Template scaffolds (Mail + Notification)

ZinTrust also provides focused scaffolds for Markdown templates:

- `zin make:mail-template` (alias: `zin make:mail`) → creates a file under `src/mail/markdown/...`
- `zin make:notification-template` → creates a file under `src/notification/markdown/...`

These are project-owned templates; see the Markdown template docs for how registries resolve templates.

## Microservices generator (services/ folder)

Separate from `zin add service`, ZinTrust includes a microservices workspace generator under the `services/` folder, driven by scripts:

- `npm run microservices:generate -- <domain> <servicesCsv>`
- `npm run microservices:bundle -- <domain> <servicesCsv>`
- `npm run microservices:docker -- <domain> <servicesCsv>`

This path is intended for domain-level microservices folders (e.g., `services/ecommerce/users`).
