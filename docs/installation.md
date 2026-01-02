# Installation & Setup

## Prerequisites

- Node.js 20+
- npm (recommended)

## Installation

```bash
npm install -g @zintrust/core
```

## Core Package Dependencies (CLI + DX)

The published npm package `@zintrust/core` includes runtime dependencies primarily for the CLI and developer experience:

- `commander` - CLI command parsing
- `inquirer` - interactive prompts
- `chalk` - colored terminal output
- `tsx` - runs TypeScript-based CLI entrypoints

Optional integrations (database drivers, Redis client, etc.) are installed on-demand using plugins.

For example:

```bash
# Install the SQLite adapter dependencies + templates
zin add db:sqlite

# Install Redis client dependency for queue/broadcast drivers
zin add queue:redis
zin add broadcast:redis

# Install cache/mail drivers on-demand
zin add cache:redis
zin add mail:nodemailer
```

Note: some drivers (e.g. `better-sqlite3`) are native modules and may require build tools on some platforms.

## First Project

```bash
zin new my-app
cd my-app

# Install database driver dependencies on-demand (example: SQLite)
zin add db:sqlite

npm run dev
```
