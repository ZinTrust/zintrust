# CLI Reference

## Core Commands

- `zin new <name>`: Create a new project
- `zin add <type> [name]`: Add a component to existing project
- `zin migrate`: Run database migrations
- `zin debug`: Start debug dashboard
- `zin logs`: View application logs
- `zin --version`: Show CLI version
- `zin --help`: Show help for any command

## The `add` Command

The `add` command is the primary way to scaffold new components.

### Usage

```bash
zin add <type> [name] [options]
```

### Available Types

| Type              | Description                                |
| :---------------- | :----------------------------------------- |
| `service`         | Create a new microservice                  |
| `feature`         | Add a new feature module                   |
| `model`           | Create an ORM model                        |
| `controller`      | Create an HTTP controller                  |
| `migration`       | Create a database migration                |
| `routes`          | Create a new route file                    |
| `middleware`      | Create a middleware class                  |
| `factory`         | Create a model factory for tests           |
| `seeder`          | Create a database seeder                   |
| `requestfactory`  | Create a service request factory           |
| `responsefactory` | Create a mock response factory             |
| `workflow`        | Create GitHub Actions deployment workflows |

### Workflow Options

When adding a `workflow`, you can specify the platform:

```bash
zin add workflow --platform lambda
```

Supported platforms: `lambda`, `fargate`, `cloudflare`, `deno`, `all`.

## Database Commands

- `zin migrate`: Run all pending migrations
- `zin migrate:rollback`: Rollback the last migration batch
- `zin migrate:fresh`: Drop all tables and re-run all migrations
- `zin seed`: Run database seeders
