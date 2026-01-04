# Adapters & Drivers

This page lists the optional database adapters and runtime drivers you can install into a Zintrust project.

## Database adapters

These are installed via the plugin system. You can use either `zin add <domain>:<driver>` (recommended) or `zin plugin install <id>`.

```bash
# SQLite (better-sqlite3)
zin add db:sqlite

# PostgreSQL (pg)
zin add db:postgres

# MySQL / MariaDB (mysql2)
zin add db:mysql

# SQL Server (mssql)
zin add db:mssql
```

## Redis drivers

These install the `redis` client dependency (no templates).

```bash
zin add queue:redis
zin add broadcast:redis
```

## Notes

- You can select a package manager explicitly with `--package-manager npm|yarn|pnpm`.
- Some drivers (e.g. `better-sqlite3`) are native modules and may require build tools on your platform.
