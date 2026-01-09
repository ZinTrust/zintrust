# CLI Reference

## Core Commands

- `zin new <name>`: Create a new project
- `zin add <type> [name]`: Add a component to existing project
- `zin prepare`: Prepare local dist/ for file: installs (dev workflow)
- `zin migrate`: Run database migrations
- `zin d1:migrate`: Run Cloudflare D1 migrations
- `zin config`: Manage project configuration
- `zin start`: Start the application (dev watch, production, or Wrangler mode)
- `zin debug`: Start debug dashboard
- `zin logs`: View application logs
- `zin templates`: List/render built-in markdown templates
- `zin make:mail-template`: Scaffold a mail markdown template into your app
- `zin make:notification-template`: Scaffold a notification markdown template into your app
- `zin fix`: Run automated code fixes
- `zin qa`: Run full Quality Assurance suite
- `zin secrets`: Pull/push secrets via the Secrets toolkit
- `zin simulate` (alias: `zin -sim`): [internal] generate a simulated app under `./simulate/`
- `zin --version`: Show CLI version
- `zin --help`: Show help for any command

## The `add` Command

The `add` command is the primary way to scaffold new components.

### Usage

```bash
zin add <type> [name] [options]
```

### Plugin-style installs

Some integrations are installed via the plugin system. As a convenience, `zin add <domain>:<driver>` delegates to `zin plugin install`.

```bash
# Database adapters
zin add db:sqlite
zin add db:postgres

# Redis drivers
zin add queue:redis
zin add broadcast:redis

# Cache + mail drivers
zin add cache:redis
zin add mail:nodemailer

# Choose a package manager explicitly (optional)
zin add db:sqlite --package-manager pnpm
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
- `zin migrate --rollback`: Rollback the last migration batch
- `zin migrate --fresh`: Drop all tables and re-run all migrations
- `zin migrate --reset`: Rollback all migrations
- `zin db:seed`: Run database seeders (see [Seeding Guide](./seeding.md))
  - `--reset`: Truncate tables before run
  - `--service <name>`: Include specific service seeders
  - `--only-service <name>`: Run ONLY specific service seeders

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
- `--wg` - Alias for `--wrangler`
- `--deno` - Start a local server using the Deno runtime adapter
- `--lambda` - Start a local server using the AWS Lambda runtime adapter
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
zin start --wg
zin start --deno
zin start --lambda
zin start --no-watch --port 3001
```

**Which start mode should I use?**

- `zin start` - Default **Node.js** dev server. Use for most local development.
- `zin start --wg` / `zin start -w` - **Cloudflare Workers** via Wrangler dev. Use when deploying to Workers or validating Workers constraints.
- `zin start --lambda` - **AWS Lambda** adapter mode. Use when deploying to Lambda and validating Lambda request semantics.
- `zin start --deno` - **Deno** adapter mode. Use when deploying to Deno or checking portability.

**When NOT to use**

- Don’t use Workers mode if your app relies on Node-only APIs or native modules (e.g. filesystem writes or `better-sqlite3`).
- Don’t use `--lambda`/`--deno` unless you’re targeting those runtimes.

Defaults:

- New apps default to `HOST=localhost` and `PORT=7777`.

## Queue / Work Commands

- `zin queue <queueName> [--timeout <seconds>] [--retry <count>] [--max-items <count>]`
- `zin queue work <kind> <queueName>` (kind: broadcast|notification)
- `zin broadcast:work <queueName>`
- `zin notification:work <queueName>`

## Secrets Command

```bash
zin secrets pull   --provider aws|cloudflare [--manifest secrets.manifest.json] [--out .env.pull] [--dry-run]
zin secrets push   --provider aws|cloudflare [--manifest secrets.manifest.json] [--in .env]      [--dry-run]
zin secrets doctor --provider aws|cloudflare
```

## Templates Command

```bash
zin templates list [mail|notification|all]
zin templates render [mail|notification|all] <name>
```
