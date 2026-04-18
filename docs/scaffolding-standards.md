# Scaffolding Standards

The ZinTrust CLI generates a consistent project structure so teams can move fast without constantly debating naming and layout. This ensures that new contributors can predict where things live, refactors are safer, and tooling (OpenAPI, route registry, QA) works predictably.

## Folder Conventions

When scaffolding a new application, ZinTrust enforces the following standard directory structure:

- **Controllers**: `app/Controllers/*Controller.ts`
- **Middleware**: `app/Middleware/*Middleware.ts`
- **Models**: `app/Models/*Model.ts`
- **Routes**: `routes/*.ts` (typically wired via `routes/api.ts`)
- **Framework Core**: `src/*` (If overriding or customizing core configurations)

The default route entrypoint is `routes/api.ts`, which demonstrates how to group routes, register module routes (health/metrics/openapi), and wire middleware.

## Naming Standards

The CLI enforces strict naming rules via interactive validation to keep imports predictable and avoid filesystem case-sensitivity edge cases:

- **Controllers** must be PascalCase and end in `Controller` (e.g. `UserController`).
- **Factories** must be PascalCase and end in `Factory`.
- **Services** are typically lowercase and must be filesystem-friendly.

## Generator Entrypoint: `zin add`

The primary scaffolding command is:

```bash
zin add <type> [name]
```

It supports both:
- Interactive prompting (default for developers)
- Scripted/CI usage (`--no-interactive`)

### Common Scaffold Types

The CLI supports a broad set of scaffolds out of the box:

- `controller`
- `routes`
- `model`
- `migration`
- `factory` / `seeder`
- `service` / `feature`
- `governance`

You can run `zin help add` in your terminal to see the canonical list of available generators.

## Controllers

To create a new controller in `app/Controllers`:

```bash
zin add controller UserController
```

Controller templates support different styles:

- `crud` (default)
- `resource`
- `api`
- `graphql`
- `websocket`
- `webhook`

Example generating a RESTful resource controller programmatically:

```bash
zin add controller UserController --controller-type resource --no-interactive
```

After generating, you map these controller methods to paths in a routes file.

## Routes

To generate a new route group file in `routes/`:

```bash
zin add routes api
```

Once generated, import and register the new group from your main route entrypoint (usually `routes/api.ts`).

## Models and Migrations

To generate a database model in `app/Models`:

```bash
zin add model User
```

Options supported by the CLI include:

- `--soft-delete` (Adds deleted_at behavior)
- `--timestamps` (Enabled by default; pass `--no-timestamps` to disable)

After creating a model, you typically generate a migration to create the corresponding database table.

## Validation & Middleware Wiring

ZinTrust encourages a standard approach to wiring validation and middleware:

1. Define middleware instances in your configuration (e.g., `config/middleware.ts` or `src/config/middleware.ts`).
2. Attach them to routes by their registered key (e.g. `{ middleware: ['validateRegister'] }`).

This pattern keeps route definitions concise, highly readable, and ensures validation is centrally managed and reusable.
