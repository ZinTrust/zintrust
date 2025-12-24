# Zintrust CLI - Quick Start Guide

## Installation

```bash
# Development
npm install
npm run build

# Make available globally
npm link

# Verify installation
zin --version
```

## Basic Commands

### Create New Project

```bash
zin new my-app
```

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
zin add controller User        # Create a controller
zin add migration create_users # Create a migration
zin add service auth           # Create a microservice
zin add workflow               # Create deployment workflows
```

For a full list of types, see the [CLI Reference](./cli-reference.md).

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
```

### Plugin Management

Manage framework extensions and database adapters.

```bash
zin plugin list                # List available plugins
zin plugin install a:sqlite    # Install SQLite adapter
zin p -i a:postgres            # Short syntax for installing Postgres
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
# - Server port (default 3000)
# - Git initialization (yes/no)
```

## Non-Interactive Mode (CI/CD)

```bash
# Skip all prompts, use defaults
zin new my-app --no-interactive
zin new my-app --database postgres --port 3000 --no-git
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
- `--port <number>` - Server port (default: 3000)
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

Add feature module to existing project

**Usage**: `zin add <feature>`

**Arguments**:

- `<feature>` - Feature name (auth, payments, notifications, webhooks, analytics)

**Examples**:

```bash
zin add auth
zin add payments
```

### zin migrate

Run database migrations

**Usage**: `zin migrate [options]`

**Options**:

- `--fresh` - Drop all tables and re-run migrations
- `--rollback` - Rollback last migration batch
- `--reset` - Rollback all migrations
- `--step <number>` - Number of batches to rollback

**Examples**:

```bash
zin migrate
zin migrate --fresh
zin migrate --rollback
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
```

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
