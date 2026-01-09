# Zintrust CLI - Quick Start Guide

## Installation

The Zintrust CLI is distributed on npm as `@zintrust/core`.

```bash
# Install globally from npm
npm install -g @zintrust/core

# Verify installation
zin --version
```

## Development (from source)

If you are working on the framework itself:

```bash
# Install dependencies
npm install
npm run build

# Make available globally
npm link
```

## Basic Commands

### Create New Project

```bash
zin new my-app
```

New projects ship with an `.env` generated during scaffolding. If values are missing/empty, the CLI backfills safe defaults:

- `HOST=localhost`
- `PORT=7777`
- `LOG_LEVEL=debug`

### Database Migrations

```bash
zin migrate                    # Run pending migrations
zin migrate --fresh            # Drop all & re-run
zin migrate --rollback         # Undo last batch
zin migrate --reset            # Undo all
```

### Add Components

The `add` command scaffolds various components for your application:

```bash
zin add model User             # Create a model
zin add controller UserController        # Create a controller
zin cm user                    # Create create_users_table migration
zin am bio user                # Create add_bio_users_table migration (requires create_users_table)
zin add migration custom_name  # Create a custom migration (advanced)
zin add service auth           # Create a microservice
zin add workflow               # Create deployment workflows
```

For a full list of types, see the [CLI Reference](./cli-reference.md).

### List Routes

To print a table of every registered route (including middleware/validation metadata), run:

```bash
zin routes
```

If you want the **URL** column to be fully qualified, set `BASE_URL` and `PORT`:

```bash
BASE_URL=http://127.0.0.1 PORT=7777 zin routes
```

You can also group and filter:

```bash
zin routes --group-by service --filter auth
zin routes --method GET,POST
zin routes --json
```

### Debug Mode

```bash
zin debug                      # Start debug server
zin debug --port 3001          # Custom port
zin debug --enable-profiling   # Enable memory profiling
zin debug --enable-tracing     # Enable request tracing
```

### Configuration

```bash
zin config list                # Show all settings
zin config get user.email      # Get specific setting
zin config set user.email user@example.com
zin config reset               # Reset to defaults
```

### Security

```bash
zin key:generate               # Generate APP_KEY
zin key:generate --show        # Show key without saving

# Mint a dev JWT for testing protected routes (prints a token)
zin jwt:dev --sub 1 --email dev@example.com --role admin
zin jwt:dev --json --expires 30m
```

### Plugin Management

Manage framework extensions and database adapters.

```bash
zin plugin list                # List available plugins
zin plugin install a:sqlite    # Install SQLite adapter
zin p -i a:postgres            # Short syntax for installing Postgres

# Modular adapter/driver shortcut (delegates to plugin installer)
zin add db:sqlite
zin add db:postgres
zin add queue:redis
zin add broadcast:redis
zin add cache:redis
zin add mail:nodemailer

# Choose a package manager explicitly (optional)
zin add db:sqlite --package-manager pnpm
```

See [Plugin System](./plugins.md) for more details.

### Quality Assurance

```bash
zin fix                        # Run automated code fixes
zin qa                         # Run full QA suite
zin qa --no-sonar              # Skip Sonar analysis
zin qa --report                # Generate HTML report
```

## Help System

```bash
# Main help
zin --help
zin -h
zin help

# Command-specific help
zin new --help
zin migrate --help
zin debug --help

# Alternative help syntax
zin help new
zin help migrate
```

## Version

```bash
zin --version
zin -v
```

## Exit Codes

| Code | Meaning       | Example                   |
| ---- | ------------- | ------------------------- |
| 0    | Success       | `zin new my-app` succeeds |
| 1    | Runtime error | Database connection fails |
| 2    | Usage error   | Missing required argument |

## Interactive Mode

All commands support interactive prompts:

```bash
zin new my-app
# Will prompt for:
# - Project name (if not provided)
# - Database type (PostgreSQL, MySQL, SQLite)
# - Server port (default 7777)
# - Git initialization (yes/no)
```

## Non-Interactive Mode (CI/CD)

```bash
# Skip all prompts, use defaults
zin new my-app --no-interactive
zin new my-app --database postgres --port 7777 --no-git
```

## Global Options (All Commands)

```bash
--verbose, -v     # Enable verbose output
--help, -h        # Show help
```

Example:

```bash
zin new my-app -v     # Create project with verbose logging
```

## Command Reference

### zin new

Create a new Zintrust project

**Usage**: `zin new <name> [options]`

**Arguments**:

- `<name>` - Project directory name

**Options**:

- `--database <type>` - Database (postgresql, mysql, sqlite)
- `--port <number>` - Server port (default: 7777)
- `--no-interactive` - Skip prompts
- `--no-git` - Skip git initialization
- `-v, --verbose` - Verbose output

**Examples**:

```bash
zin new my-app
zin new my-app --database mysql --port 3001
zin new my-app --no-interactive --no-git
```

### zin add

Add components (generators) and install plugins

**Usage**: `zin add <type> [name] [options]`

**Arguments**:

- `<type>` - Generator type (model, controller, migration, service, workflow, etc) OR plugin id/alias (`db:sqlite`, `queue:redis`, ...)
- `[name]` - Name for generators that require it (omit for plugin ids like `db:sqlite`)

**Examples**:

```bash
zin add auth
zin add payments

# Plugin-style installs via `zin add <domain>:<driver>`
zin add db:sqlite
zin add queue:redis --package-manager pnpm
```

### zin migrate

Run database migrations

**Usage**: `zin migrate [options]`

**Options**:

- `--fresh` - Drop all tables and re-run migrations
- `--rollback` - Rollback last migration batch
- `--reset` - Rollback all migrations
- `--status` - Show migration status
- `--service <domain/name>` - Run global + service-local migrations
- `--only-service <domain/name>` - Run only service-local migrations
- `--step <number>` - Number of batches to rollback (for `--rollback`)
- `--force` - Allow running migrations in production without prompts
- `--no-interactive` - Skip interactive prompts
- `--local` - D1 only: run migrations against local D1 database
- `--remote` - D1 only: run migrations against remote D1 database
- `--database <name>` - D1 only: D1 database name

**Notes**:

- If `DB_CONNECTION` is `d1`/`d1-remote`, `zin migrate` supports **apply-only** (it compiles TS migrations to Wrangler SQL and then applies via Wrangler). For rollback/reset/status, use Wrangler subcommands (or `zin d1:migrate` for apply).

**Examples**:

```bash
zin migrate
zin migrate --status
zin migrate --fresh
zin migrate --rollback
zin migrate --rollback --step 2

# D1 (local by default)
zin migrate --local --database zintrust_db

# CI / non-interactive production deploys
zin migrate --force --no-interactive
```

### zin debug

Launch debug mode with profiling

**Usage**: `zin debug [options]`

**Options**:

- `--port <number>` - Debug server port (default: 3000)
- `--enable-profiling` - Enable memory profiling
- `--enable-tracing` - Enable request tracing

**Examples**:

```bash
zin debug
zin debug --port 3001
zin debug --enable-profiling --enable-tracing
```

### zin config

Manage Zintrust configuration

**Usage**: `zin config <subcommand> [args]`

**Subcommands**:

- `list` - Show all configuration
- `get [key]` - Get specific configuration value
- `set <key> <value>` - Set configuration value
- `reset [key]` - Reset to defaults

**Examples**:

```bash
zin config list
zin config get user.email
zin config set user.email user@example.com
zin config reset
```

### zin start

Start the application in development (watch), production, or Wrangler mode.

**Usage**: `zin start [options]`

**Options**:

- `-w, --wrangler` - Start with Wrangler dev mode (Cloudflare Workers)
- `--wg` - Alias for `--wrangler`
- `--deno` - Start a local server using the Deno runtime adapter
- `--lambda` - Start a local server using the AWS Lambda runtime adapter
- `--watch` - Force watch mode (Node only)
- `--no-watch` - Disable watch mode (Node only)
- `--mode <development|production|testing>` - Override app mode
- `--runtime <nodejs|cloudflare|lambda|deno|auto>` - Set `RUNTIME` for spawned Node process
- `--port <number>` - Override server port (sets `PORT`)

**Examples**:

```bash
zin start
zin start --mode production
zin start --no-watch --port 3001
zin start -w
zin start --wg
zin start --deno
zin start --lambda
```

**Which start mode should I use?**

- `zin start` (default) - Runs the app in **Node.js**. Use this for day-to-day development and local debugging.
- `zin start --wg` / `zin start -w` - Runs the app in **Cloudflare Workers** via Wrangler dev. Use this when your deployment target is Workers or you want to catch Workers-only constraints early (no native Node addons, limited filesystem, and no disallowed global-scope side effects).
- `zin start --lambda` - Runs the app using the **AWS Lambda runtime adapter**. Use this when your deployment target is Lambda and you want to validate Lambda-style request handling.
- `zin start --deno` - Runs the app using the **Deno runtime adapter**. Use this when deploying on Deno or when you want to ensure your code avoids Node-only assumptions.

**When NOT to use**

- Don’t use `--wg/--wrangler` if your request path depends on Node-only features (e.g. local filesystem writes, raw TCP sockets, or native modules like `better-sqlite3`).
- Don’t use `--lambda` or `--deno` unless you are targeting those runtimes; they exist primarily to catch runtime-specific differences.

Notes:

- `--runtime` affects the spawned **Node** process only; it does not change Wrangler’s runtime.
- If you see “Address already in use”, pass a different port: `zin start --wg --port 8787`.

## Troubleshooting

### Command not found

```bash
# Make sure to install globally
npm link

# Or verify npm install completed
npm install
```

### Permission denied

```bash
# Make scripts executable
chmod +x bin/zintrust.ts bin/zin.ts bin/z.ts
```

### Port already in use

```bash
# Use different port
zin debug --port 3001
zin start --port 3001
```

### Interactive prompts in CI/CD

```bash
# Use --no-interactive flag
zin new my-app --no-interactive --database postgres --port 3000
```

## Environment Variables

Configure Zintrust via environment variables:

```bash
# Database
export DB_CONNECTION=postgresql
export DB_HOST=localhost
export DB_DATABASE=zintrust_dev

# Server
export APP_PORT=3000
export APP_DEBUG=true

# Logging
export LOG_LEVEL=debug
export LOG_PATH=./logs

# Microservices
export MICROSERVICES=true
export MICROSERVICES_TRACING=true
```

## Configuration File

Project configuration at `.zintrust.json`:

```json
{
  "project": {
    "name": "my-app",
    "port": 3000
  },
  "database": {
    "connection": "postgresql",
    "host": "localhost",
    "database": "zintrust_dev"
  },
  "features": ["auth", "payments"]
}
```

Global configuration at `~/.zintrust/config.json`:

```json
{
  "user": {
    "email": "user@example.com"
  },
  "defaults": {
    "database": "postgresql",
    "port": 3000
  }
}
```

---

For more information, see the full documentation or run `zin --help`.
