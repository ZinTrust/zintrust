# CLI Reference

## Core Commands

- `zin new <name>`: Create a new project
- `zin add <type> [name]`: Add a component to existing project
- `zin create migration <model>`: Create a create-table migration (same as `zin cm <model>`)
- `zin cm <model>`: Shortcut: create-table migration (creates `create_\<models>_table`)
- `zin am <column> <model>`: Shortcut: add-column migration (creates `add_\<column>_\<models>_table`)
- `zin prepare`: Prepare local dist/ for file: installs (dev workflow)
- `zin migrate`: Run database migrations
- `zin d1:migrate`: Run Cloudflare D1 migrations
- `zin config`: Manage project configuration
- `zin start`: Start the application (dev watch, production, or Wrangler mode)
- `zin debug`: Start debug dashboard
- `zin logs`: View application logs
- `zin templates`: List/render built-in markdown templates
- `zin routes` (alias: `zin route:list`): List all registered routes (table/JSON)
- `zin jwt:dev`: Mint a local development JWT (for manual API testing)
- `zin make:mail-template`: Scaffold a mail markdown template into your app
- `zin make:notification-template`: Scaffold a notification markdown template into your app
- `zin fix`: Run automated code fixes
- `zin qa`: Run full Quality Assurance suite
- `zin secrets`: Pull/push secrets via the Secrets toolkit
- `zin simulate` (alias: `zin -sim`): Generate a simulated app under `./simulate/` (dev utility)
- `zin --version`: Show CLI version
- `zin --help`: Show help for any command

## Deploy Command Styles

ZinTrust supports both spaced and colon styles for deploy targets where applicable.

- `zin deploy cw` and `zin deploy:cw` - Deploy container workers stack (`docker-compose.workers.yml`)
- `zin deploy cwr` and `zin deploy:cwr` - Compatibility aliases to deploy the same container workers stack
- `zin deploy cp` and `zin deploy:cp` - Deploy proxy stack (`docker-compose.proxy.yml`)
- `zin deploy worker` - Deploy Cloudflare Worker environment via Wrangler
- `zin deploy production` - Deploy production Wrangler environment

Notes:

- `zin deploy <target>` keeps Wrangler behavior for cloud targets (`worker`, `d1-proxy`, `kv-proxy`, `production`)
- `cw` is the primary Docker Compose deployment target; `cwr` remains a compatibility alias
- `cp` is the Docker Compose deployment target for proxy stack operations

Examples:

```bash
zin deploy cw
zin deploy:cw

zin deploy cwr
zin deploy:cwr

zin deploy cp
zin deploy:cp
```

## Container Stack Init Commands

- `zin init:cw` / `zin init:container-workers` - Initialize worker container stack files
- `zin init:proxy` - Initialize proxy stack files (`docker-compose.proxy.yml`, `docker/proxy-gateway/nginx.conf`)
- Proxy init aliases: `zin init:cp`, `zin init:container-proxies`, `zin init:py/proxy`

## Container Proxies Commands

- `zin cp build`: Build proxy stack images
- `zin cp up`: Start proxy stack
- `zin cp up -d`: Start proxy stack in detached mode
- `zin cp down`: Stop proxy stack
- `zin cp down --volumes`: Stop proxy stack and remove named volumes

## Routes Command

Lists all routes registered by your router (including group prefixes) and prints a table.

Columns:

- **URL**: computed from `BASE_URL` + `PORT` + route path (safe-joined to avoid `//`)
- **Group**: derived router group (or service name if `--group-by service`)
- **Method**, **Path**, **Middleware**, **Validation**, **Handler**

Usage:

```bash
zin routes [options]
zin route:list [options]
```

Options:

- `--group-by <mode>`: `group` | `service` | `none` (default: `group`)
- `--filter <text>`: substring filter across all columns
- `--method <methods>`: comma list (e.g. `GET,POST`)
- `--json`: machine-readable output

Examples:

```bash
# Pretty table (URL uses BASE_URL + PORT)
BASE_URL=http://127.0.0.1 PORT=7777 zin routes

# Group by service segment under /api/v1/<service>/...
zin routes --group-by service

# Filter to auth routes only
zin routes --filter auth

# JSON output
zin routes --json
```

## JWT Dev Token (`jwt:dev`)

Mints a JWT that is compatible with the framework's `jwt` middleware (useful for manual testing protected routes).

Usage:

```bash
zin jwt:dev [options]
```

Options:

- `--sub <sub>`: subject claim (default: `1`)
- `--email <email>`: adds `email` claim
- `--role <role>`: adds `role` claim
- `--expires <duration>`: seconds or `30m`/`1h`/`7d` (default: `1h`)
- `--json`: machine-readable output (prints a JSON object containing `token` and metadata)
- `--allow-production`: override safety guard (dangerous)

Examples:

```bash
# Mint a token and paste it into an Authorization header
zin jwt:dev --sub 1 --email dev@example.com --role admin

# JSON mode (easy to script)
zin jwt:dev --json --expires 30m
```

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

### Migration scaffolding

Migration filenames are timestamped, but the CLI will reject generating two migrations with the same logical name (for example, it will not allow creating `*_create_users_table.ts` twice).

```bash
# Create-table migration (recommended)
zin cm user

# Same as above
zin create migration user

# Add-column migration (requires create migration to exist first)
zin am bio user

# Custom migration name (advanced)
zin add migration create_users_table

# Shorthand: zin add migration <column> <model>
zin add migration bio user
```

### Workflow Options

When adding a `workflow`, you can specify the platform:

```bash
zin add workflow --platform lambda
```

Supported platforms: `lambda`, `fargate`, `cloudflare`, `deno`, `all`.

## Database Commands

- `zin migrate`: Run all pending migrations
- `zin migrate --status`: Show migration status
- `zin migrate --rollback`: Rollback the last migration batch
- `zin migrate --rollback --step <number>`: Rollback multiple batches
- `zin migrate --fresh`: Drop all tables and re-run all migrations
- `zin migrate --reset`: Rollback all migrations
- `zin migrate --all`: Run migrations for all configured database connections
- `zin migrate --service <domain/name>`: Run global + service-local migrations
- `zin migrate --only-service <domain/name>`: Run only service-local migrations
- `zin migrate --force`: Allow running migrations in production without prompts
- `zin migrate --no-interactive`: Skip interactive prompts
- `zin migrate --local|--remote --database <name>`: D1 only: compile TS migrations to Wrangler SQL and apply via Wrangler
- `zin db:seed`: Run database seeders (see [Seeding Guide](./seeding.md))
  - `--reset`: Truncate tables before run
  - `--service <name>`: Include specific service seeders
  - `--only-service <name>`: Run ONLY specific service seeders

## Plugin Commands

- `zin plugin list` (alias: `zin p -l`): List available plugins
- `zin plugin install <id>` (alias: `zin p -i`): Install a plugin
- `zin plugin uninstall <id>` (alias: `zin p -u`): Uninstall a plugin

## Proxy Commands

All proxy commands support both styles:

- `zin proxy:<name>`
- `zin proxy <name>`

Supported proxies:

- Redis: `zin proxy:redis` / `zin proxy redis` (legacy alias still works: `zin redis:proxy`)
- SMTP: `zin proxy:smtp` / `zin proxy smtp`
- MySQL: `zin proxy:mysql` / `zin proxy mysql`
- PostgreSQL: `zin proxy:postgres` / `zin proxy postgres`
- MongoDB: `zin proxy:mongodb` / `zin proxy mongodb`
- SQL Server: `zin proxy:sqlserver` / `zin proxy sqlserver`

Examples:

```bash
zin proxy:smtp
zin proxy smtp

zin proxy:redis
zin proxy redis

zin redis:proxy
```

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
- `zin queue prune [--hours <count>]`: Prune failed jobs from database (default: 168h / 7 days)
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
