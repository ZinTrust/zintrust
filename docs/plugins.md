# Plugin System

The Zintrust Framework uses a "Zero-Config" plugin system to manage optional components like database adapters, authentication providers, and other features. This keeps the core framework lightweight and dependency-free while allowing you to easily add powerful capabilities when needed.

## Overview

Plugins in Zintrust are more than just npm packages. They are **templates** that inject production-ready code directly into your project structure. This gives you full control over the implementation—you can modify the installed adapter code to fit your specific needs without fighting against a black-box library.

## Managing Plugins

You can manage plugins using the `zin plugin` (or `zin p`) command.

### Listing Available Plugins

To see what plugins are available for installation:

```bash
zin plugin list
# OR
zin p -l
```

Output example:

```
Available Plugins:
  adapter:postgres     - Available     Production-ready PostgreSQL database adapter
  adapter:sqlite       ✓ Installed     Production-ready SQLite database adapter
```

### Installing a Plugin

To install a plugin, use the `install` command with the plugin ID or one of its aliases.

```bash
# Standard syntax
zin plugin install adapter:sqlite

# Short syntax
zin p -i a:sqlite

# Choose a package manager explicitly (optional)
zin plugin install adapter:sqlite --package-manager pnpm
```

**What happens during installation?**

> You can control which package manager is used to install the plugin's dependencies with `--package-manager`.
> If not specified, Zintrust will attempt to detect the project package manager by looking for lockfiles (`pnpm-lock.yaml`, `yarn.lock`, `package-lock.json`) and default to `npm` if none are found. Supported values: `npm`, `yarn`, `pnpm`.

1.  **Dependencies**: The CLI runs `npm install` in your current project directory (updates `package.json` and your lockfile).
2.  **Code Generation**: The CLI copies pre-configured, production-ready TypeScript files (e.g., `src/orm/adapters/SQLiteAdapter.ts`) into your project.
3.  **Post-install commands**: Some plugins include an optional `postInstall.command` (for setup tasks). For safety, the framework will **not** execute these commands by default; you must opt-in by setting `ZINTRUST_ALLOW_POSTINSTALL=1` in your environment. Review any post-install commands before enabling them.
4.  **Configuration**: You are ready to go! The framework automatically detects the new adapter.

# Standard syntax

zin plugin uninstall adapter:sqlite

# Short syntax

zin p -u a:sqlite

```

_Note: Uninstall is currently **non-destructive** and does not roll back generated files or remove npm dependencies. If you want to revert, do it manually (e.g., restore from git)._

## Available Plugins

### Database Adapters

| Plugin ID          | Aliases              | Description                           | Dependencies      |
| :----------------- | :------------------- | :------------------------------------ | :---------------- |
| `adapter:postgres` | `a:postgres`, `pg`   | PostgreSQL adapter using `pg`         | `pg`, `@types/pg` |
| `adapter:mysql`    | `a:mysql`, `mysql`   | MySQL adapter using `mysql2`          | `mysql2`          |
| `adapter:sqlite`   | `a:sqlite`, `sqlite` | SQLite adapter using `better-sqlite3` | `better-sqlite3`  |
| `adapter:mssql`    | `a:mssql`, `mssql`   | SQL Server adapter using `mssql`      | `mssql`           |

### Features

| Plugin ID       | Aliases            | Description                        | Dependencies             |
| :-------------- | :----------------- | :--------------------------------- | :----------------------- |
| `feature:auth`  | `f:auth`, `auth`   | JWT & Bcrypt authentication helper | `jsonwebtoken`, `bcrypt` |
| `feature:queue` | `f:queue`, `queue` | Simple job queue interface         | None                     |

## Creating Custom Plugins

(Coming Soon)
Future versions of Zintrust will allow you to define your own local plugins to standardize components across your organization.
```
