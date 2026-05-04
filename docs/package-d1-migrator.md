---
title: D1 Migrator
description: Resumable database migrations to Cloudflare D1 for ZinTrust
---

# D1 Migrator

The `@zintrust/d1-migrator` package provides a dedicated CLI workflow for migrating existing databases to Cloudflare D1.

It supports resumable migrations, schema analysis, data validation, and batch-based transfer for MySQL, PostgreSQL, SQLite, and SQL Server sources.

For single-column auto-increment primary keys, the migrator preserves the database-owned id allocation contract on D1 by emitting `INTEGER PRIMARY KEY AUTOINCREMENT` instead of degrading the column into a non-rowid primary key shape.

## Installation

```bash
npm install @zintrust/d1-migrator
```

After installation, the command is auto-registered with the ZinTrust CLI. No manual entry in `src/zintrust.plugins.ts` is required.

```bash
zin migrate-to-d1 --help
```

## What it provides

- Source support for MySQL, PostgreSQL, SQLite, and SQL Server
- Target support for local D1 and remote D1 workflows
- Checkpoint-based resume support for interrupted migrations
- Schema compatibility checks before migration
- Rowid-backed preservation for imported auto-increment primary keys
- Dry-run mode for validation before execution
- Batch and checkpoint tuning for large datasets

## Basic usage

### Zero-arg env-driven mode

```bash
export DB_CONNECTION=mysql
export DB_READ_HOSTS=127.0.0.1
export DB_PORT=3306
export DB_DATABASE=zintrust
export DB_USERNAME=root
export DB_PASSWORD=secret
export D1_TARGET_DB=zintrust-live-test

zin migrate-to-d1
```

### Explicit flags

```bash
zin migrate-to-d1 \
  --from mysql \
  --source-connection "mysql://user:password@localhost:3306/mydb" \
  --to d1 \
  --target-database my-d1-db
```

## Common options

| Option                  | Description                                                 |
| ----------------------- | ----------------------------------------------------------- |
| `--from`                | Source driver: `mysql`, `postgresql`, `sqlite`, `sqlserver` |
| `--to`                  | Target mode: `d1` or `d1-remote`                            |
| `--source-connection`   | Source database connection string                           |
| `--target-database`     | Target D1 database name or identifier                       |
| `--batch-size`          | Rows per migration batch                                    |
| `--checkpoint-interval` | Rows between saved checkpoints                              |
| `--dry-run`             | Validate without making changes                             |
| `--schema-only`         | Convert and inspect schema only                             |
| `--interactive`         | Interactive mode for compatibility review                   |
| `--resume`              | Resume a previous migration                                 |

## Programmatic usage

```typescript
import { D1Migrator } from '@zintrust/d1-migrator';

const progress = await D1Migrator.DataMigrator.migrateData({
  sourceConnection: 'mysql://user:password@localhost:3306/mydb',
  sourceDriver: 'mysql',
  targetDatabase: 'my-d1-db',
  targetType: 'd1',
  batchSize: 1000,
  checkpointInterval: 10000,
});

console.log(progress.status, progress.processedRows);
```

## When to use it

Use `@zintrust/d1-migrator` when you need to:

- move an existing SQL database into Cloudflare D1
- analyze source schema compatibility before migration
- perform safe dry runs before production transfer
- resume interrupted migrations without starting over

## Related docs

- [Cloudflare D1 Remote](cloudflare-d1-remote.md)
- [Cloudflare Databases](cloudflare-databases.md)
- [Database Strategy](database-strategy.md)
- [Adapters & Drivers](adapters.md)

## Package

- npm: [@zintrust/d1-migrator](https://www.npmjs.com/package/@zintrust/d1-migrator)
- README: [@zintrust/d1-migrator README](https://www.npmjs.com/package/@zintrust/d1-migrator?activeTab=readme)
