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
```

**What happens during installation?**

1.  **Dependencies**: The CLI installs necessary npm packages (e.g., `better-sqlite3`, `@types/better-sqlite3`) into your `package.json`.
2.  **Code Generation**: The CLI copies a pre-configured, production-ready TypeScript file (e.g., `src/orm/adapters/SQLiteAdapter.ts`) into your project.
3.  **Configuration**: You are ready to go! The framework automatically detects the new adapter.

### Uninstalling a Plugin

```bash
# Standard syntax
zin plugin uninstall adapter:sqlite

# Short syntax
zin p -u a:sqlite
```

_Note: Currently, uninstalling does not automatically remove the generated code or npm dependencies to prevent accidental data loss. You will need to manually revert the file changes if desired._

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
