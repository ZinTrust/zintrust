# Adapters & Drivers

This page lists the optional database adapters and runtime drivers you can install into a ZinTrustproject.

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

## Cache drivers

```bash
zin add cache:redis
zin add cache:mongodb
```

## Queue drivers

```bash
zin add queue:rabbitmq
zin add queue:sqs
```

## Storage drivers

```bash
zin add storage:s3
zin add storage:r2
zin add storage:gcs
```

## Mail drivers

```bash
zin add mail:smtp
zin add mail:sendgrid
zin add mail:mailgun
zin add mail:nodemailer
```

## Notes

- You can select a package manager explicitly with `--package-manager npm|yarn|pnpm`.
- Some drivers (e.g. `better-sqlite3`) are native modules and may require build tools on your platform.
