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
- `zin migrate-to-d1`: Migrate external databases (MySQL/PostgreSQL/SQLite/SQL Server) into D1
- `zin config`: Manage project configuration
- `zin start`: Start the application (dev watch, production, or Wrangler mode)
- `zin docker` (aliases: `zin dk`, `zin dkr`): Run Wrangler dev using a Docker-backed Cloudflare Containers config
- `zin debug`: Start debug dashboard
- `zin logs`: View application logs
- `zin templates`: List/render built-in markdown templates
- `zin routes` (alias: `zin route:list`): List all registered routes (table/JSON)
- `zin queue:recovery`: Run queue recovery once, start reliability orchestrator, or inspect/recover specific tracked jobs
- `zin schedule:list`: List registered schedules (core + `app/Schedules`)
- `zin schedule:run`: Run a single schedule once (by name)
- `zin schedule:start`: Start the schedules daemon (Node/Fargate) and block until shutdown
- `zin jwt:dev`: Mint a local development JWT (for manual API testing, now supports Bulletproof-compatible claims)
- `zin key:bulletproof` (aliases: `bulletproof:key`, `key:signer`): Generate/rotate `BULLETPROOF_SIGNING_SECRET` in `.env` with automatic backup rotation
- `zin make:mail-template`: Scaffold a mail markdown template into your app
- `zin make:notification-template`: Scaffold a notification markdown template into your app
- `zin fix`: Run automated code fixes
- `zin qa`: Run full Quality Assurance suite
- `zin secrets`: Pull/push secrets via the Secrets toolkit
- `zin put cloudflare`: Push Wrangler secrets from dynamic key groups in `.zintrust.json`
- `zin simulate` (alias: `zin -sim`): Generate a simulated app under `./simulate/` (dev utility)
- `zin --version`: Show CLI version
- `zin --help`: Show help for any command

## Deploy Command Styles

ZinTrust supports both spaced and colon styles for deploy targets where applicable.

- `zin deploy cw` and `zin deploy:cw` - Deploy container workers stack (`docker-compose.workers.yml`)
- `zin deploy cwr` and `zin deploy:cwr` - Compatibility aliases to deploy the same container workers stack
- `zin deploy cp` and `zin deploy:cp` - Deploy Docker Compose proxy stack (`docker-compose.proxy.yml`)
- `zin deploy:ccp` (aliases: `zin d:ccp`, `zin ccp:deploy`) - Deploy Cloudflare Containers proxy Worker (`wrangler.containers-proxy.jsonc`)
- `zin deploy worker` - Deploy Cloudflare Worker environment via Wrangler
- `zin deploy production` - Deploy production Wrangler environment

Notes:

- `zin deploy <target>` keeps Wrangler behavior for cloud targets (`worker`, `d1-proxy`, `kv-proxy`, `production`)
- `cw` is the primary Docker Compose deployment target; `cwr` remains a compatibility alias
- `cp` is the Docker Compose deployment target for proxy stack operations
- `deploy:ccp` is a dedicated command (not a `zin deploy <target>` value) for the Cloudflare Containers proxy Worker

Examples:

```bash
zin deploy cw
zin deploy:cw

zin deploy cwr
zin deploy:cwr

zin deploy cp
zin deploy:cp

# Cloudflare Containers proxy Worker
zin deploy:ccp -e staging
```

## Container Stack Init Commands

- `zin init:cw` / `zin init:container-workers` - Initialize worker container stack files (`docker-compose.workers.yml`, `Dockerfile.workers`)
- `zin init:proxy` - Initialize proxy stack files (`docker-compose.proxy.yml`, `docker/proxy-gateway/nginx.conf`)
- `zin init:containers-proxy` (alias: `zin init:ccp`) - Scaffold Cloudflare Containers proxy Worker (`wrangler.containers-proxy.jsonc`, `src/containers-proxy.ts`)
- `zin init:ecosystem` - Scaffold `docker-compose.ecosystem.yml` and `docker-compose.schedules.yml`
- Proxy init aliases: `zin init:cp`, `zin init:container-proxies`, `zin init:py`

### `zin init:cw` Output

`zin init:cw` now generates a single-service worker stack plus a dedicated overlay Dockerfile:

- `docker-compose.workers.yml`
  - `workers-api`: built from `Dockerfile.workers` with target `worker`, serves the worker pages, and auto-starts eligible workers through the normal bootstrap path
- `Dockerfile.workers`
  - builds the local project with `npm run build`
  - copies compiled `dist/app/Workers` artifacts into the final image when present
  - copies compiled `dist/src/zintrust.workers.js` into the final image when present

This is the canonical way to extend the published `zintrust/zintrust` image while still letting
projects choose either file-backed worker discovery from `app/Workers` or explicit bootstrap via
`src/zintrust.workers.ts`.

The generated compose file tags the project overlay result as `WORKERS_IMAGE`. That name refers to the
built overlay image, not the upstream base image. The upstream base remains `zintrust/zintrust` inside
`Dockerfile.workers`.

## Container Workers Commands

- `zin cw build`: Build the container workers image (`docker-compose.workers.yml`)
- `zin cw up`: Start container workers

Publish (Docker Hub, requires repo/org access):

- `zin docker push`: Build and push Docker images via Docker buildx

Options:

- `--tag <tag>`: Tag to publish (default: current version; also pushes `:latest`)
- `--platforms <list>`: Comma list for buildx (default: `linux/amd64,linux/arm64`)
- `--no-also-latest`: If `--tag` is not `latest`, do not also push `:latest`
- `--only <target>`: `runtime` | `worker` | `gateway` | `both` (default: `both`)

## Container Proxies Commands

- `zin cp build`: Build proxy stack images
- `zin cp up`: Start proxy stack
- `zin cp up -d`: Start proxy stack in detached mode
- `zin cp down`: Stop proxy stack
- `zin cp down --volumes`: Stop proxy stack and remove named volumes

Publish (Docker Hub, requires repo/org access):

- `zin docker push`: Build and push Docker images via Docker buildx

Options:

- `--tag <tag>`: Tag to publish (default: current version; also pushes `:latest`)
- `--platforms <list>`: Comma list for buildx (default: `linux/amd64,linux/arm64`)
- `--no-also-latest`: If `--tag` is not `latest`, do not also push `:latest`
- `--only <target>`: `runtime` | `gateway` | `both` (default: `both`)

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

Mints a JWT compatible with the framework's `jwt` middleware. Supports all standard claims plus Bulletproof Auth binding claims.

Usage:

```bash
zin jwt:dev [options]
```

Options:

| Option                 | Description                                                   | Default |
| ---------------------- | ------------------------------------------------------------- | ------- |
| `--sub <sub>`          | `sub` (subject) claim                                         | `1`     |
| `--email <email>`      | Adds `email` claim                                            | —       |
| `--role <role>`        | Adds `role` claim                                             | —       |
| `--expires <duration>` | Token expiry: seconds or `30m`/`1h`/`7d`                      | `1h`    |
| `--device-id <id>`     | Adds `deviceId` claim (required for Bulletproof layer 7)      | —       |
| `--tz <timezone>`      | Adds `tz` claim (Bulletproof layer 8 binding)                 | —       |
| `--ua <user-agent>`    | Computes SHA-256 of the UA string and adds `uaHash` (layer 9) | —       |
| `--ua-hash <hash>`     | Adds `uaHash` directly (hex string)                           | —       |
| `--tenant-id <id>`     | Adds `tenantId` claim                                         | —       |
| `--json`               | Machine-readable output (`{ token, ... }`)                    | —       |
| `--allow-production`   | Override safety guard (dangerous)                             | —       |

Examples:

```bash
# Standard token for jwt middleware
zin jwt:dev --sub 1 --email dev@example.com --role admin

# Bulletproof-compatible token (all binding claims)
zin jwt:dev \
  --sub 1 \
  --email dev@example.com \
  --role admin \
  --device-id dev_abc123 \
  --tz "America/New_York" \
  --ua "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"

# JSON mode for scripting
zin jwt:dev --json --expires 30m --device-id dev_abc123
```

## Bulletproof Key Generator (`key:bulletproof`)

Generates a new `BULLETPROOF_SIGNING_SECRET` and writes it to `.env`. The current secret is automatically rotated into the `BULLETPROOF_SIGNING_SECRET_BK` backup array.

Usage:

```bash
zin key:bulletproof [options]
```

Aliases: `zin bulletproof:key`, `zin key:signer`

Options:

- `--show`: Print the generated key to stdout only — do not modify `.env`
- `--max-backups <n>`: Maximum number of old secrets to keep in `BULLETPROOF_SIGNING_SECRET_BK` (default: `5`, max: `50`)

Examples:

```bash
# Generate and save to .env (rotates old secret to BK array)
zin key:bulletproof

# Print key only
zin key:bulletproof --show

# Limit backup history
zin key:bulletproof --max-backups 3
```

Environment variables managed:

```bash
# .env (after running zin key:bulletproof)
BULLETPROOF_SIGNING_SECRET=base64:<new-random-32-bytes>
BULLETPROOF_SIGNING_SECRET_BK=["base64:<old-secret>"]
```

Fallback chain when `BULLETPROOF_SIGNING_SECRET` is unset:
`AUTH_KEY` → `APP_KEY`

> **Recommendation:** Always set a dedicated `BULLETPROOF_SIGNING_SECRET` for production. The fallback to `APP_KEY` is only suitable for local development.

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

## Cloudflare Secret Put Command

Pushes secrets to Wrangler environments using dynamic key groups from `.zintrust.json`.

Usage:

```bash
zin put cloudflare --wg <wrangler-env...> --var <group...> [--env_path .env] [--config wrangler.jsonc] [--dry-run]
```

Examples:

```bash
zin put cloudflare --wg d1-proxy --var d1_env --env_path .env --dry-run
zin put cloudflare --wg kv-proxy --var kv_env --env_path .env
zin put cloudflare --wg d1-proxy kv-proxy --var d1_env kv_env --env_path .env

# Target a dedicated wrangler config (example: Cloudflare Containers proxy)
zin put cloudflare --wg staging --var proxy_env --config wrangler.containers-proxy.jsonc
```

`.zintrust.json` dynamic groups example:

```json
{
  "d1_env": ["APP_KEY", "D1_REMOTE_SECRET"],
  "kv_env": ["APP_KEY", "KV_REMOTE_SECRET"]
}
```

Notes:

- `--wg` sets the Wrangler target environment(s) (for example `d1-proxy`, `kv-proxy`).
- `--var` selects array keys from `.zintrust.json`.
- `--config` targets a specific Wrangler config file (useful when your repo has multiple wrangler configs).
- `D1_REMOTE_SECRET` / `KV_REMOTE_SECRET` are optional if you use `APP_KEY` as the shared signing secret; missing values are reported as failures for whichever keys you selected.
- Final output includes totals for pushed and failed keys.

## Queue Recovery Command

Manage queue reliability flows from CLI.

Usage:

```bash
zin queue:recovery [options]
```

## Schedule Commands

ZinTrust supports lightweight in-process schedules (Node/Fargate), plus manual triggering via CLI.

Usage:

```bash
zin schedule:list [--json]
zin schedule:run --name <schedule>
```

Examples:

```bash
# List all schedules
zin schedule:list

# Run job-tracking cleanup on demand
zin schedule:run --name jobTracking.cleanup
```

Common options:

- `--once`: Run `JobRecoveryDaemon.runOnce()` one time.
- `--start`: Start the reliability orchestrator intervals.
- `--list`: List tracked jobs.
- `--source <source>`: List source: `memory` or `db` (default: `memory`).
- `--queue <name>`: Filter list or target lookup by queue.
- `--status <status>`: Filter listed jobs by status.
- `--limit <count>`: Limit listed jobs (default: `50`, max: `5000`).
- `--json`: Print list output as JSON.

Targeted recovery options:

- `--job-id <id>`: Target a specific tracked job.
- `--push`: Force direct requeue of target payload.
- `--dry-run`: Print intended action without changing queue/tracker state.
- `--no-db-lookup`: Disable fallback lookup in persisted tracker tables for target job.

Examples:

```bash
# Run one recovery pass now
zin queue:recovery --once

# Start reliability orchestrator intervals
zin queue:recovery --start

# List recoverable jobs from in-memory tracker
zin queue:recovery --list --status pending_recovery --limit 100

# List persisted tracked jobs from DB
zin queue:recovery --list --source db --queue emails --json

# Recover a single job using policy logic
zin queue:recovery --job-id job-123 --queue emails

# Force push a specific job back to queue
zin queue:recovery --job-id job-123 --queue emails --push
```

## Plugin Commands

- `zin plugin list` (alias: `zin p -l`): List available plugins
- `zin plugin install <id>` (alias: `zin p -i`): Install a plugin
- `zin plugin uninstall <id>` (alias: `zin p -u`): Uninstall a plugin

## Proxy Commands

All proxy commands support both styles:

- `zin proxy:<name>`
- `zin proxy <name>`

Supported proxies:

- D1: `zin proxy:d1` / `zin proxy d1`
- KV: `zin proxy:kv` / `zin proxy kv`
- Redis: `zin proxy:redis` / `zin proxy redis` (legacy alias still works: `zin redis:proxy`)
- SMTP: `zin proxy:smtp` / `zin proxy smtp`
- MySQL: `zin proxy:mysql` / `zin proxy mysql`
- PostgreSQL: `zin proxy:postgres` / `zin proxy postgres`
- MongoDB: `zin proxy:mongodb` / `zin proxy mongodb`
- SQL Server: `zin proxy:sqlserver` / `zin proxy sqlserver`

Examples:

```bash
zin proxy:d1
zin proxy d1

zin proxy:kv
zin proxy kv

zin proxy:smtp
zin proxy smtp

zin proxy:redis
zin proxy redis

zin redis:proxy
```

Notes:

- `zin proxy:d1` scaffolds `env.d1-proxy` into `wrangler.jsonc` when it is missing and then runs `wrangler dev --env d1-proxy`.
- The generated D1 proxy shim re-exports `ZintrustD1Proxy` from `@zintrust/core/proxy`.
- `zin proxy:kv` scaffolds `env.kv-proxy` into `wrangler.jsonc` when it is missing and then runs `wrangler dev --env kv-proxy`.
- The generated KV proxy shim re-exports `ZintrustKvProxy` from `@zintrust/core/proxy`.

## Configuration Commands

- `zin key:generate`: Generate and set the application key (`APP_KEY`)
- `zin key:generate --show`: Display the key without modifying `.env`
- `zin key:bulletproof`: Generate/rotate `BULLETPROOF_SIGNING_SECRET` (aliases: `bulletproof:key`, `key:signer`)
- `zin key:bulletproof --show`: Print key only, do not modify `.env`
- `zin key:bulletproof --max-backups <n>`: Set max rotation backup count (default: 5)
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
- `--env <name>` - Wrangler environment name (Wrangler mode only)
- `--wrangler-config <path>` - Wrangler config path (Wrangler mode only)
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
zin start --wg --env staging
zin start --wg --wrangler-config wrangler.containers-proxy.jsonc --env staging
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

## Worker Migration Command

- `zin migrate:worker`
- `zin migrate:worker --status`
- `zin migrate:worker --fresh`
- `zin migrate:worker --rollback --step 1`
- `zin migrate:worker --reset`
- `zin migrate:worker --all`
- `zin migrate:worker --connection d1`

Use `--connection <name>` to target a specific configured database connection directly. When omitted,
the command resolves the connection in this order: `--connection` flag, `WORKER_PERSISTENCE_DB_CONNECTION`, then `default`.

For D1-backed worker persistence, use the matching configured connection name, for example:

```bash
zin migrate:worker --connection d1
zin migrate:worker --connection d1-remote
```

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

### `zin migrate-to-d1`

Migrates an external database (MySQL, PostgreSQL, SQLite, SQL Server) to a Cloudflare D1 local or remote database securely with checkpointing.

> This command is auto-registered by the core ZinTrust CLI when `@zintrust/d1-migrator` is installed in your project. Freshly scaffolded apps include it by default.

**Usage:**
`zin migrate-to-d1 [--from driver] [--to target] [--source-connection uri] [--target-database name]`

The command resolves settings in this order: **CLI flag -> environment variable -> default**.

**Env-only usage (no CLI flags):**

```bash
export DB_CONNECTION=mysql
export DB_READ_HOSTS=127.0.0.1
export DB_PORT=3306
export DB_DATABASE=zintrust
export DB_USERNAME=root
export DB_PASSWORD=secret
# Optional (defaults to "d1" when omitted)
export D1_TARGET_DB=zintrust-live-test

zin migrate-to-d1
```

**Options:**

- `-f, --from <type>`: Source db type (`mysql`, `postgresql`, `sqlite`, `sqlserver`).
- `-t, --to <type>`: Target db type (`d1` or `d1-remote`).
- `-s, --source-connection <uri>`: Source connection string.
- `-d, --target-database <string>`: D1 Database identifier (defaults to `d1`).
- `-b, --batch-size <number>`: Pagination step for data chunking.
- `-r, --resume`: Resume a previously failed migration state.
- `-i, --interactive`: Approve schema modifications manually.

**Supported env fallbacks:**

- Driver: `MIGRATE_TO_D1_FROM`, `MIGRATE_TO_D1_SOURCE_DRIVER`, `D1_MIGRATOR_SOURCE_DRIVER`, `DB_CONNECTION`
- Source URI: `MIGRATE_TO_D1_SOURCE_CONNECTION`, `D1_MIGRATOR_SOURCE_CONNECTION`, `SOURCE_DATABASE_URL`, `DATABASE_URL`, `DB_URL`
- Target type: `MIGRATE_TO_D1_TO`, `MIGRATE_TO_D1_TARGET_TYPE`, `D1_MIGRATOR_TARGET_TYPE`, `D1_TARGET_TYPE`
- Target DB: `MIGRATE_TO_D1_TARGET_DATABASE`, `D1_MIGRATOR_TARGET_DATABASE`, `D1_TARGET_DB`, `D1_DATABASE`, `D1_DATABASE_ID`, `DB_DATABASE`
- Batch size: `MIGRATE_TO_D1_BATCH_SIZE`, `D1_MIGRATOR_BATCH_SIZE`
- Checkpoint interval: `MIGRATE_TO_D1_CHECKPOINT_INTERVAL`, `D1_MIGRATOR_CHECKPOINT_INTERVAL`
- Flags: `MIGRATE_TO_D1_DRY_RUN`, `MIGRATE_TO_D1_SCHEMA_ONLY`, `MIGRATE_TO_D1_INTERACTIVE`, `MIGRATE_TO_D1_RESUME`, and matching `D1_MIGRATOR_*` variants
- Migration id: `MIGRATE_TO_D1_MIGRATION_ID`, `D1_MIGRATOR_MIGRATION_ID`

If source URI is omitted, the command auto-builds it from `DB_*` settings (or `DB_PATH`/`DB_DATABASE` for SQLite). Host fallback prefers `DB_READ_HOSTS`, then `DB_HOSTS`, then `DB_HOST`.

**Live test configuration (MySQL -> local D1):**

```bash
DB_PORT=3306
DB_DATABASE=zintrust
DB_USERNAME=root
DB_PASSWORD=sdf2434sde43
DB_READ_HOSTS=127.0.0.1
```

**Live test example:**

```bash
LOG_LEVEL=error \
zin migrate-to-d1 \
  --from mysql \
  --source-connection "mysql://${DB_USERNAME}:${DB_PASSWORD}@${DB_READ_HOSTS}:${DB_PORT}/${DB_DATABASE}" \
  --to d1 \
  --target-database zintrust-live-test \
  --batch-size 1000 \
  --checkpoint-interval 5000
```
