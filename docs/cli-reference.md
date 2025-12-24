# CLI Reference

## Core Commands

- `zin new <name>`: Create a new project
- `zin add <type> [name]`: Add a component to existing project
- `zin migrate`: Run database migrations
- `zin d1:migrate`: Run Cloudflare D1 migrations
- `zin config`: Manage project configuration
- `zin start`: Start the application (dev watch, production, or Wrangler mode)
- `zin debug`: Start debug dashboard
- `zin logs`: View application logs
- `zin fix`: Run automated code fixes
- `zin qa`: Run full Quality Assurance suite
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

## Plugin Commands

- `zin plugin list` (alias: `zin p -l`): List available plugins
- `zin plugin install <id>` (alias: `zin p -i`): Install a plugin
- `zin plugin uninstall <id>` (alias: `zin p -u`): Uninstall a plugin

## Configuration Commands

- `zin key:generate`: Generate and set the application key
- `zin key:generate --show`: Display the key without modifying .env
- `zin config list`: List all configuration values
- `zin config get <key>`: Get a specific configuration value
- `zin config set <key> <value>`: Set a configuration value
- `zin config reset`: Reset configuration to defaults
- `zin config edit`: Open configuration in default editor
- `zin config export <file>`: Export configuration to a file

## Quality & Maintenance

- `zin fix`: Run automated code fixes (ESLint, Prettier)
- `zin fix --dry-run`: Show what would be fixed without applying changes
- `zin qa`: Run full QA suite (Lint, Type-check, Test, Sonar)
- `zin qa --no-sonar`: Skip SonarQube analysis during QA
- `zin qa --report`: Generate and open HTML QA report

## Cloudflare D1 Commands

- `zin d1:migrate`: Run Cloudflare D1 migrations
- `zin d1:migrate --local`: Run migrations against local D1 database
- `zin d1:migrate --remote`: Run migrations against remote D1 database

## Start Command

**Usage**:

```bash
zin start [options]
```

**Options**:

- `-w, --wrangler` - Start with Wrangler dev mode (Cloudflare Workers)
- `--watch` - Force watch mode (Node only)
- `--no-watch` - Disable watch mode (Node only)
- `--mode <development|production|testing>` - Override app mode
- `--runtime <nodejs|cloudflare|lambda|deno|auto>` - Set `RUNTIME` for spawned Node process
- `--port <number>` - Override server port

**Examples**:

```bash
zin start
zin start --mode production
zin start -w
zin start --no-watch --port 3001
```
