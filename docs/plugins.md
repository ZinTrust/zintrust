# Plugin System

The ZinTrustFramework uses a "Zero-Config" plugin system to manage optional components like database adapters, authentication providers, and other features. This keeps the core framework lightweight and dependency-free while allowing you to easily add powerful capabilities when needed.

## Overview

Plugins in ZinTrustare a mix of **npm dependencies** and (optionally) **templates** that scaffold code into your project. For modular adapters/drivers, the key step is activation: the CLI updates `src/zintrust.plugins.ts` with side-effect imports (for example `@zintrust/db-postgres/register`) so the adapter/driver registers itself at runtime.

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

# Shortcut syntax (delegates to plugin installer)
zin add db:sqlite

# Choose a package manager explicitly (optional)
zin plugin install adapter:sqlite --package-manager pnpm
```

**What happens during installation?**

> You can control which package manager is used to install the plugin's dependencies with `--package-manager`.
> If not specified, ZinTrustwill attempt to detect the project package manager by looking for lockfiles (`pnpm-lock.yaml`, `yarn.lock`, `package-lock.json`) and default to `npm` if none are found. Supported values: `npm`, `yarn`, `pnpm`.

1.  **Dependencies**: The CLI runs your chosen package manager in your project directory (updates `package.json` and your lockfile).
2.  **Templates (optional)**: Some plugins scaffold files into your project (features, helpers, etc.).
3.  **Activation**: For modular adapters/drivers, the CLI adds imports to `src/zintrust.plugins.ts` so registrations are active at runtime.
4.  **Post-install commands (opt-in)**: Some plugins include a `postInstall.command`. For safety, the framework will **not** execute these commands by default; you must opt-in by setting `ZINTRUST_ALLOW_POSTINSTALL=1`.

### Uninstalling a Plugin

```bash
# Standard syntax
zin plugin uninstall adapter:sqlite

# Short syntax
zin p -u a:sqlite
```

_Note: Uninstall is currently **non-destructive** and does not roll back generated files or remove npm dependencies. If you want to revert, do it manually (e.g., restore from git)._

## Available Plugins

### Database Adapters

| Plugin ID          | Aliases                                            | Description                                    | Dependencies             |
| :----------------- | :------------------------------------------------- | :--------------------------------------------- | :----------------------- |
| `adapter:postgres` | `a:postgres`, `pg`, `db:postgres`, `db:postgresql` | PostgreSQL adapter (registers via plugin hook) | `@zintrust/db-postgres`  |
| `adapter:mysql`    | `a:mysql`, `mysql`, `db:mysql`                     | MySQL adapter (registers via plugin hook)      | `@zintrust/db-mysql`     |
| `adapter:sqlite`   | `a:sqlite`, `sqlite`, `db:sqlite`                  | SQLite adapter (registers via plugin hook)     | `@zintrust/db-sqlite`    |
| `adapter:mssql`    | `a:mssql`, `mssql`, `db:mssql`                     | SQL Server adapter (registers via plugin hook) | `@zintrust/db-sqlserver` |

### Drivers

| Plugin ID                | Aliases           | Description                                                     | Dependencies                                     |
| :----------------------- | :---------------- | :-------------------------------------------------------------- | :----------------------------------------------- |
| `driver:queue-redis`     | `queue:redis`     | Redis-backed queue driver (installs @zintrust/queue-redis)      | `@zintrust/queue-redis`                          |
| `driver:queue-rabbitmq`  | `queue:rabbitmq`  | RabbitMQ-backed queue driver (registers via plugin hook)        | `@zintrust/queue-rabbitmq`, `amqplib`            |
| `driver:queue-sqs`       | `queue:sqs`       | AWS SQS-backed queue driver (registers via plugin hook)         | `@zintrust/queue-sqs`, `@aws-sdk/client-sqs`     |
| `driver:broadcast-redis` | `broadcast:redis` | Redis-backed broadcast driver (installs redis client)           | `redis`                                          |
| `driver:cache-redis`     | `cache:redis`     | Redis cache driver (registers via plugin hook)                  | `@zintrust/cache-redis`                          |
| `driver:cache-mongodb`   | `cache:mongodb`   | MongoDB Atlas Data API cache driver (registers via plugin hook) | `@zintrust/cache-mongodb`                        |
| `driver:mail-nodemailer` | `mail:nodemailer` | Nodemailer mail driver (registers via plugin hook)              | `@zintrust/mail-nodemailer`                      |
| `driver:mail-smtp`       | `mail:smtp`       | SMTP mail driver (registers via plugin hook)                    | `@zintrust/mail-smtp`                            |
| `driver:mail-sendgrid`   | `mail:sendgrid`   | SendGrid mail driver (registers via plugin hook)                | `@zintrust/mail-sendgrid`                        |
| `driver:mail-mailgun`    | `mail:mailgun`    | Mailgun mail driver (registers via plugin hook)                 | `@zintrust/mail-mailgun`                         |
| `driver:storage-s3`      | `storage:s3`      | S3 storage driver (registers via plugin hook)                   | `@zintrust/storage-s3`                           |
| `driver:storage-r2`      | `storage:r2`      | Cloudflare R2 storage driver (registers via plugin hook)        | `@zintrust/storage-r2`                           |
| `driver:storage-gcs`     | `storage:gcs`     | Google Cloud Storage driver (registers via plugin hook)         | `@zintrust/storage-gcs`, `@google-cloud/storage` |

### Features

| Plugin ID       | Aliases            | Description                        | Dependencies             |
| :-------------- | :----------------- | :--------------------------------- | :----------------------- |
| `feature:auth`  | `f:auth`, `auth`   | JWT & Bcrypt authentication helper | `jsonwebtoken`, `bcrypt` |
| `feature:queue` | `f:queue`, `queue` | Simple job queue interface         | None                     |

## Creating Custom Plugins

Custom/local plugins are not supported yet.

<!-- end -->
