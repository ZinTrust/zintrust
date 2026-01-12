# Scaffolding Standards

The ZinTrust CLI generates a consistent project structure so teams can move fast without constantly debating naming and layout.

This page describes the conventions the CLI expects and produces.

## Folder conventions (typical project)

- Controllers: `app/Controllers/*Controller.ts`
- Middleware: `app/Middleware/*Middleware.ts`
- Models: `app/Models/*Model.ts` (or `app/Models/*.ts` depending on generator)
- Route registration: `routes/*.ts` (typically wired via `routes/api.ts`)
- Framework core (in this repo): `src/*`

The example route entrypoint is `routes/api.ts`, which shows how to group routes, register module routes (health/metrics/openapi), and wire middleware.

## Naming standards (enforced by prompts)

Many generators enforce naming rules via interactive validation.

Examples from `zin add`:

- Controllers must be PascalCase and end in `Controller` (e.g. `UserController`).
- Factories must be PascalCase and end in `Factory`.
- Services are typically lowercase and must be filesystem-friendly.

These rules are designed to keep imports predictable and avoid OS/filesystem edge cases.

## Generator entrypoint: `zin add`

The primary scaffolding command is:

- `zin add <type> [name]`

Implementation: `src/cli/commands/AddCommand.ts`.

It supports both:

- interactive prompting (default)
- scripted/CI usage (`--no-interactive`)

### Common `type` values

The CLI supports a broad set of scaffolds. Frequently used ones:

- `controller`
- `routes`
- `model`
- `migration`
- `factory`, `seeder`
- `service`, `feature`
- `governance`

Use `zin help add` in your repo for the canonical list.

## Controllers

Create a controller in `app/Controllers`:

```bash
zin add controller UserController
```

Controller templates support different styles (as of current CLI):

- `crud` (default)
- `resource`, `api`, `graphql`, `websocket`, `webhook`

Example:

```bash
zin add controller UserController --controller-type resource --no-interactive
```

After generating, register controller methods in a routes file (see the patterns in `routes/api.ts`).

## Routes

Generate a new route group file in `routes/`:

```bash
zin add routes api
```

Then import and register it from your main route entrypoint (often `routes/api.ts`).

## Models and migrations

Generate a model in `app/Models`:

```bash
zin add model User
```

Options supported by the CLI include:

- `--soft-delete`
- `--timestamps` (enabled by default; pass `--no-timestamps` to disable)

After creating a model, generate a migration and wire it into your migration workflow.

## Validation + middleware wiring

This repo demonstrates a common standard:

- define validation middleware instances in `src/config/middleware.ts`
- attach them to routes by key (e.g. `middleware: ['validateRegister']`)

This makes route definitions readable and ensures validation is centrally managed.

## Why scaffolding standards matter

- New contributors can predict where things live.
- Refactors are safer when structure is consistent.
- Tooling (OpenAPI, route registry, QA) works best when patterns are predictable.
