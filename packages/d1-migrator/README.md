# @zintrust/d1-migrator

Migrate any database (MySQL, PostgreSQL, SQLite, SQL Server) to Cloudflare D1 with resumable operations, checkpoint recovery, and comprehensive data validation. Built for production use with careful attention to data integrity and operational safety.

Docs: https://zintrust.com/package-d1-migrator

[![NPM Version](https://img.shields.io/npm/v/@zintrust/d1-migrator)](https://www.npmjs.com/package/@zintrust/d1-migrator)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D20.0.0-green)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0%2B-blue)](https://www.typescriptlang.org/)
[![MIT License](https://img.shields.io/badge/license-MIT-brightgreen)](LICENSE.md)

> **Reliable, resumable database migrations to Cloudflare D1 with full data integrity verification.**

## Features

- **Multi-source Support**: Migrate from MySQL, PostgreSQL, SQLite, or SQL Server
- **Resumable Operations**: Automatic checkpointing allows recovery from failures without data loss
- **Data Integrity**: Row-count verification, checksums, and validation at every step
- **D1 Compatibility**: Automatic schema conversion and value transformation for SQLite compatibility
- **Dry-Run Mode**: Test migrations safely before executing
- **Interactive Mode**: Get guidance for complex migrations with compatibility issues
- **Batch Processing**: Configurable batch sizes for memory efficiency
- **Progress Tracking**: Real-time migration progress with detailed metrics
- **Error Resilience**: Comprehensive error handling with detailed reporting
- **Zero Downtime**: Works with live databases without requiring offline periods
- **TypeScript First**: Full type safety and IDE support out of the box

## Requirements

- **Node.js**: >= 20.0.0 (ESM support required)
- **TypeScript**: >= 5.0.0
- **@zintrust/core**: Latest version
- **Wrangler**: >= 2.0.0 (for D1 management)

## Installation

Install the package with your preferred package manager:

```bash
npm install @zintrust/d1-migrator
# or
yarn add @zintrust/d1-migrator
# or
pnpm add @zintrust/d1-migrator
```

The package requires source database adapters depending on which database you're migrating from. These are automatically included as dependencies:

- MySQL → `@zintrust/db-mysql`
- PostgreSQL → `@zintrust/db-postgres`
- SQLite → `@zintrust/db-sqlite`
- SQL Server → `@zintrust/db-sqlserver`
- Target → `@zintrust/db-d1`

## CLI Auto-Registration

No manual registration is required.

After installing `@zintrust/d1-migrator`, ZinTrust auto-detects the package and exposes the `zin migrate-to-d1` command automatically:

```bash
npm install @zintrust/d1-migrator
zin migrate-to-d1 --help
```

You do not need to add `@zintrust/d1-migrator` to `src/zintrust.plugins.ts`, and you do not need to run `zin plugin install` for this package. Installing it is enough.

## Quick Start

### Via CLI (Recommended)

#### Zero-arg command (env-driven)

Set env vars once, then run the command without flags:

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

The command resolves values in this order: **CLI flag → environment variable → built-in default**.

#### Explicit flags

```bash
# Analyze and migrate a MySQL database to D1
zin migrate-to-d1 \
  --from mysql \
  --source-connection "mysql://user:password@localhost:3306/mydb" \
  --to d1 \
  --target-database my-d1-db
```

### Via TypeScript

```typescript
import { D1Migrator } from '@zintrust/d1-migrator';

const config = {
  sourceConnection: 'mysql://user:password@localhost:3306/mydb',
  sourceDriver: 'mysql',
  targetDatabase: 'my-d1-db',
  targetType: 'd1',
  batchSize: 1000,
  checkpointInterval: 10000,
};

const progress = await D1Migrator.DataMigrator.migrateData(config);
console.log(`Migration complete: ${progress.processedRows} rows migrated`);
```

## Usage Guide

### CLI Commands

#### Basic Migration

```bash
zin migrate-to-d1 \
  --from mysql \
  --source-connection "mysql://user:password@localhost:3306/sourcedb" \
  --to d1 \
  --target-database target-d1-db
```

#### With Custom Batch Size

```bash
zin migrate-to-d1 \
  --from postgresql \
  --source-connection "postgresql://user:password@localhost:5432/sourcedb" \
  --to d1-remote \
  --target-database my-d1-remote \
  --batch-size 5000 \
  --checkpoint-interval 25000
```

#### Dry Run (Test Mode)

```bash
zin migrate-to-d1 \
  --from mysql \
  --source-connection "mysql://user:password@localhost:3306/sourcedb" \
  --to d1 \
  --target-database test-d1-db \
  --dry-run
```

#### Schema-Only Analysis

```bash
zin migrate-to-d1 \
  --from sqlserver \
  --source-connection "mssql://user:password@localhost:1433/sourcedb" \
  --to d1 \
  --target-database target-d1-db \
  --schema-only
```

#### Interactive Mode

```bash
zin migrate-to-d1 \
  --from mysql \
  --source-connection "mysql://user:password@localhost:3306/sourcedb" \
  --to d1 \
  --target-database target-d1-db \
  --interactive
```

#### Resume Failed Migration

```bash
zin migrate-to-d1 \
  --resume \
  --migration-id abc123def456
```

### CLI Options

| Option                  | Short | Type    | Required | Default | Description                                                        |
| ----------------------- | ----- | ------- | -------- | ------- | ------------------------------------------------------------------ |
| `--from`                | `-f`  | string  | ✗        | —       | Source database type: `mysql`, `postgresql`, `sqlite`, `sqlserver` |
| `--to`                  | `-t`  | string  | ✗        | `d1`    | Target: `d1` (local) or `d1-remote`                                |
| `--source-connection`   | `-s`  | string  | ✗        | —       | Source connection URI (falls back to env or DB\_\* composition)    |
| `--target-database`     | `-d`  | string  | ✗        | `d1`    | Target D1 database identifier (or env fallback)                    |
| `--batch-size`          | `-b`  | number  | ✗        | `1000`  | Records per batch during data copy                                 |
| `--checkpoint-interval` | `-c`  | number  | ✗        | `10000` | Save checkpoint every N rows                                       |
| `--dry-run`             | —     | boolean | ✗        | `false` | Test migration without making changes                              |
| `--schema-only`         | —     | boolean | ✗        | `false` | Analyze and convert schema only                                    |
| `--interactive`         | `-i`  | boolean | ✗        | `false` | Interactive mode for complex migrations                            |
| `--resume`              | `-r`  | boolean | ✗        | `false` | Resume a previously paused/failed migration                        |
| `--migration-id`        | —     | string  | ✗        | —       | Migration ID to resume (required with `--resume`)                  |

### Environment Variable Fallbacks

The command supports env-based execution for all CLI settings.

| Setting                                       | Env variables (priority order)                                                                                                 |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Source driver (`--from`)                      | `MIGRATE_TO_D1_FROM`, `MIGRATE_TO_D1_SOURCE_DRIVER`, `D1_MIGRATOR_SOURCE_DRIVER`, `DB_CONNECTION`                              |
| Source URI (`--source-connection`)            | `MIGRATE_TO_D1_SOURCE_CONNECTION`, `D1_MIGRATOR_SOURCE_CONNECTION`, `SOURCE_DATABASE_URL`, `DATABASE_URL`, `DB_URL`            |
| Target type (`--to`)                          | `MIGRATE_TO_D1_TO`, `MIGRATE_TO_D1_TARGET_TYPE`, `D1_MIGRATOR_TARGET_TYPE`, `D1_TARGET_TYPE`                                   |
| Target DB (`--target-database`)               | `MIGRATE_TO_D1_TARGET_DATABASE`, `D1_MIGRATOR_TARGET_DATABASE`, `D1_TARGET_DB`, `D1_DATABASE`, `D1_DATABASE_ID`, `DB_DATABASE` |
| Batch size (`--batch-size`)                   | `MIGRATE_TO_D1_BATCH_SIZE`, `D1_MIGRATOR_BATCH_SIZE`                                                                           |
| Checkpoint interval (`--checkpoint-interval`) | `MIGRATE_TO_D1_CHECKPOINT_INTERVAL`, `D1_MIGRATOR_CHECKPOINT_INTERVAL`                                                         |
| Dry run (`--dry-run`)                         | `MIGRATE_TO_D1_DRY_RUN`, `D1_MIGRATOR_DRY_RUN`                                                                                 |
| Schema only (`--schema-only`)                 | `MIGRATE_TO_D1_SCHEMA_ONLY`, `D1_MIGRATOR_SCHEMA_ONLY`                                                                         |
| Interactive (`--interactive`)                 | `MIGRATE_TO_D1_INTERACTIVE`, `D1_MIGRATOR_INTERACTIVE`                                                                         |
| Resume (`--resume`)                           | `MIGRATE_TO_D1_RESUME`, `D1_MIGRATOR_RESUME`                                                                                   |
| Migration ID (`--migration-id`)               | `MIGRATE_TO_D1_MIGRATION_ID`, `D1_MIGRATOR_MIGRATION_ID`                                                                       |

If `--source-connection` is not provided, the command automatically composes a URI from `DB_*` values for MySQL/PostgreSQL/SQL Server, and uses `DB_PATH`/`DB_DATABASE` for SQLite. Host fallback prefers `DB_READ_HOSTS`, then `DB_HOSTS`, then `DB_HOST`.

### Programmatic Usage

#### Basic Migration

```typescript
import { D1Migrator } from '@zintrust/d1-migrator';

const config = {
  sourceConnection: 'mysql://user:password@localhost:3306/mydb',
  sourceDriver: 'mysql' as const,
  targetDatabase: 'my-d1-db',
  targetType: 'd1' as const,
  batchSize: 1000,
  checkpointInterval: 10000,
  migrationId: 'migration-' + Date.now(),
};

try {
  const progress = await D1Migrator.DataMigrator.migrateData(config);

  console.log('Migration Results:');
  console.log(`- Status: ${progress.status}`);
  console.log(`- Tables: ${progress.totalTables}`);
  console.log(`- Rows: ${progress.processedRows}/${progress.totalRows}`);
  console.log(`- Errors: ${Object.keys(progress.errors).length}`);

  if (progress.status === 'failed') {
    console.error('Migration errors:', progress.errors);
  }
} catch (error) {
  console.error('Migration failed:', error);
}
```

#### Schema Analysis Only

```typescript
import { D1Migrator } from '@zintrust/d1-migrator';

const connection = {
  driver: 'mysql' as const,
  connectionString: 'mysql://user:password@localhost:3306/mydb',
};

const schema = await D1Migrator.SchemaAnalyzer.analyzeSchema(connection);

console.log(`Found ${schema.tables.length} tables`);
schema.tables.forEach((table) => {
  console.log(`- ${table.name}: ${table.columns.length} columns, ${table.rowCount} rows`);
});

// Check D1 compatibility
const compatibility = D1Migrator.SchemaAnalyzer.checkD1Compatibility(schema);
if (!compatibility.compatible) {
  console.warn('Compatibility issues:', compatibility.issues);
}
```

#### Schema Conversion

```typescript
import { D1Migrator } from '@zintrust/d1-migrator';

const sourceSchema = await D1Migrator.SchemaAnalyzer.analyzeSchema(connection);
const d1Schema = D1Migrator.SchemaBuilder.buildD1Schema(sourceSchema.tables, 'mysql');

// d1Schema contains D1-compatible CREATE TABLE statements
console.log(d1Schema);
```

#### Data Validation

```typescript
import { D1Migrator } from '@zintrust/d1-migrator';

const results = await D1Migrator.DataValidator.validateMigration(
  config,
  sourceSchema,
  targetDatabase
);

results.forEach((result) => {
  console.log(`Table: ${result.table}`);
  console.log(`- Source rows: ${result.sourceCount}`);
  console.log(`- Target rows: ${result.targetCount}`);
  console.log(`- Match: ${result.checksumMatch ? '✓' : '✗'}`);

  if (!result.checksumMatch) {
    console.warn('- Missing rows:', result.missingRows?.length);
    console.warn('- Extra rows:', result.extraRows?.length);
  }
});
```

## Connection Strings

### MySQL

```
mysql://[username]:[password]@[host]:[port]/[database]

Examples:
mysql://root:password@localhost:3306/mydb
mysql://user:pass@db.example.com:3306/production
mysql://root@127.0.0.1/app_db
```

### PostgreSQL

```
postgresql://[username]:[password]@[host]:[port]/[database]

Examples:
postgresql://user:password@localhost:5432/mydb
postgresql://postgres:secret@db.example.com:5432/prod
postgresql://user@127.0.0.1/app_db
```

### SQLite

```
sqlite://[path/to/database.db]
or
/path/to/database.db

Examples:
sqlite:///data/app.db
/Users/user/projects/db.sqlite
./data/local.db
```

### SQL Server

```
mssql://[username]:[password]@[host]:[port]/[database]

Examples:
mssql://sa:Password123@localhost:1433/mydb
mssql://user:pass@db.example.com:1433/production
```

## Configuration Reference

### MigrationConfig

```typescript
interface MigrationConfig {
  // Source database connection
  sourceConnection: string; // Connection URI
  sourceDriver: SourceDatabaseDriver; // mysql | postgresql | sqlite | sqlserver

  // Target D1 database
  targetDatabase: string; // D1 database identifier
  targetType: 'd1' | 'd1-remote'; // Local or remote D1

  // Migration behavior (optional)
  batchSize?: number; // Records per batch (default: 1000)
  checkpointInterval?: number; // Save checkpoint every N rows (default: 10000)
  dryRun?: boolean; // Test without changes (default: false)
  interactive?: boolean; // Interactive mode (default: false)
  migrationId?: string; // Migration identifier for resume
}
```

### MigrationProgress

```typescript
interface MigrationProgress {
  migrationId: string;
  currentTable: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  processedRows: number;
  totalRows: number;
  totalTables: number;
  percentage: number;
  errors: Record<string, string>; // table -> error message
  startTime?: Date;
  endTime?: Date;
}
```

## Advanced Features

### Checkpoint Recovery

Migrations are automatically checkpointed every N rows (default 10,000). If a migration fails, you can resume from the last checkpoint:

```bash
# View checkpoint information
ls -la .wrangler/state/v3/migrations/

# Resume migration from checkpoint
zin migrate-to-d1 --resume --migration-id abc123def456
```

### Custom Batch Sizing

Batch size affects both performance and memory usage:

```typescript
// Small batches: slower but more memory-efficient
// Good for resource-constrained environments
batchSize: 500,
checkpointInterval: 2500,

// Large batches: faster but uses more memory
// Good for high-performance environments
batchSize: 5000,
checkpointInterval: 25000,
```

### Dry-Run Mode

Always test migrations in dry-run mode first to catch issues:

```bash
zin migrate-to-d1 \
  --from mysql \
  --source-connection "mysql://user:password@localhost:3306/mydb" \
  --to d1 \
  --target-database test-db \
  --dry-run
```

### Interactive Mode

For complex migrations with compatibility warnings, use interactive mode:

```bash
zin migrate-to-d1 \
  --from sqlserver \
  --source-connection "mssql://user:password@localhost:1433/mydb" \
  --to d1 \
  --target-database target-db \
  --interactive
```

The interactive mode will:

- Show all compatibility warnings
- Ask for confirmation before proceeding
- Suggest workarounds for unsupported features
- Allow manual schema adjustments

## Type Conversions

### Automatic Data Transformations

The migrator automatically converts data types for D1 compatibility:

| Source Type         | SQLite Type     | Notes                            |
| ------------------- | --------------- | -------------------------------- |
| DATETIME, TIMESTAMP | TEXT (ISO 8601) | Converted to ISO 8601 strings    |
| BIGINT              | TEXT            | Large integers stored as strings |
| DECIMAL, NUMERIC    | TEXT            | Precision preserved as strings   |
| JSON                | TEXT            | JSON objects stored as strings   |
| BLOB                | BLOB            | Binary data preserved            |
| NULL                | NULL            | Null values preserved            |

### Manual Value Transformation

For custom value transformations:

```typescript
import { D1Migrator } from '@zintrust/d1-migrator';

const transformed = D1Migrator.TypeConverter.transformValue(value, sourceType, 'sqlite');
```

## Error Handling

### Common Errors and Solutions

#### Connection Failed

```
Error: Unable to connect to source database
```

**Solution**: Check connection string format and network connectivity.

```bash
# Verify connection
mysql -h localhost -u user -p -D database -e "SELECT 1;"
```

#### Schema Incompatibility

```
Error: Schema compatibility issues prevent migration
  - Unsupported column type: GEOMETRY
  - Unsupported feature: PARTITION BY
```

**Solution**: Use interactive mode to review and accept changes:

```bash
zin migrate-to-d1 --from mysql --to d1 --interactive
```

#### Row Count Mismatch

```
Error: Data migration verification failed
  Expected rows: 1000, Inserted rows: 998
```

**Solution**: Review specific table logs:

1. Check for NULL values in unique/primary key columns
2. Verify foreign key constraints on source
3. Run validation to identify missing rows:

```typescript
const validation = await D1Migrator.DataValidator.validateMigration(config);
validation.forEach((result) => {
  if (!result.checksumMatch) {
    console.log(`Missing rows in ${result.table}:`, result.missingRows);
  }
});
```

#### Out of Memory

```
Error: FATAL ERROR: CALL_AND_RETRY_LAST Allocation failed
```

**Solution**: Reduce batch size:

```bash
zin migrate-to-d1 \
  --source-connection "..." \
  --batch-size 500 \
  --checkpoint-interval 2500
```

## Performance Tuning

### Optimization Guidelines

1. **Batch Size**: Balance between memory and speed
   - Test with 1000-2000 records first
   - Increase if memory available and no OOM errors
   - Decrease if experiencing memory pressure

2. **Checkpoint Interval**: Balance between durability and speed
   - Set to 5-10x batch size
   - More checkpoints = slower but safer
   - Fewer checkpoints = faster but riskier

3. **Connection Pooling**: Configure at adapter level
   - MySQL: Best with 5-10 connections
   - PostgreSQL: Best with 2-5 connections
   - SQLite: Single connection optimal

4. **Network**: For remote sources
   - Ensure low latency connection
   - Consider regional endpoints if available
   - Use compression if supported

### Benchmarks (Typical Performance)

| Source          | Size      | Time    | Type       |
| --------------- | --------- | ------- | ---------- |
| MySQL 5.7       | 100k rows | ~5 min  | 1000 batch |
| PostgreSQL 13   | 500k rows | ~25 min | 2000 batch |
| SQL Server 2019 | 1M rows   | ~50 min | 2000 batch |
| SQLite 3        | 100k rows | ~2 min  | 1000 batch |

## Examples

### Complete Migration Workflow

```typescript
import { D1Migrator } from '@zintrust/d1-migrator';
import { Logger } from '@zintrust/core';

async function migrateDatabase() {
  try {
    // Step 1: Analyze source schema
    Logger.info('Analyzing source database...');
    const connection = {
      driver: 'mysql' as const,
      connectionString: process.env.DB_SOURCE_URL!,
    };

    const schema = await D1Migrator.SchemaAnalyzer.analyzeSchema(connection);
    Logger.info(`Found ${schema.tables.length} tables`);

    // Step 2: Check D1 compatibility
    const compatibility = D1Migrator.SchemaAnalyzer.checkD1Compatibility(schema);
    if (!compatibility.compatible) {
      throw new Error(`Compatibility issues: ${compatibility.issues.join(', ')}`);
    }

    // Step 3: Build D1 schema
    const d1Schema = D1Migrator.SchemaBuilder.buildD1Schema(schema.tables, 'mysql');
    Logger.info('D1 schema built successfully');

    // Step 4: Migrate data
    Logger.info('Starting data migration...');
    const config = {
      sourceConnection: process.env.DB_SOURCE_URL!,
      sourceDriver: 'mysql' as const,
      targetDatabase: process.env.D1_DATABASE!,
      targetType: 'd1' as const,
      batchSize: 1000,
      checkpointInterval: 10000,
      migrationId: 'migration-' + Date.now(),
    };

    const progress = await D1Migrator.DataMigrator.migrateData(config);

    if (progress.status === 'failed') {
      Logger.error('Migration failed:', progress.errors);
      throw new Error('Migration failed with errors');
    }

    // Step 5: Validate migration
    Logger.info('Validating migrated data...');
    const validation = await D1Migrator.DataValidator.validateMigration(
      config,
      schema,
      process.env.D1_DATABASE!
    );

    const allValid = validation.every((r) => r.checksumMatch);
    if (!allValid) {
      Logger.warn('Validation warnings found');
      validation.forEach((r) => {
        if (!r.checksumMatch) {
          Logger.warn(`${r.table}: source=${r.sourceCount}, target=${r.targetCount}`);
        }
      });
    }

    Logger.info('Migration completed successfully!');
    Logger.info(`Total rows: ${progress.processedRows}`);
    Logger.info(
      `Duration: ${(progress.endTime!.getTime() - progress.startTime!.getTime()) / 1000}s`
    );
  } catch (error) {
    Logger.error('Migration failed:', error);
    throw error;
  }
}

// Execute
migrateDatabase().catch(console.error);
```

### Monitor Migration Progress

```typescript
import { D1Migrator } from '@zintrust/d1-migrator';

async function monitorMigration(config: MigrationConfig) {
  const trackProgress = setInterval(async () => {
    try {
      const state = await D1Migrator.CheckpointManager.getCheckpointState(config.migrationId);

      if (state) {
        const percentage = (state.processedRows / state.totalRows) * 100;
        console.log(
          `Progress: ${percentage.toFixed(1)}% (${state.processedRows}/${state.totalRows})`
        );
      }
    } catch (error) {
      console.error('Failed to get progress:', error);
    }
  }, 5000); // Update every 5 seconds

  const progress = await D1Migrator.DataMigrator.migrateData(config);

  clearInterval(trackProgress);
  return progress;
}
```

## Troubleshooting

### Debug Logging

Enable verbose logging to diagnose issues:

```bash
LOG_LEVEL=debug zin migrate-to-d1 \
  --from mysql \
  --source-connection "mysql://user:password@localhost:3306/mydb" \
  --to d1 \
  --target-database target-db
```

### Test Connection

Verify source database connectivity:

```bash
# MySQL
mysql -h localhost -u user -p -D database -e "SELECT 1;"

# PostgreSQL
psql -h localhost -U user -d database -c "SELECT 1;"

# SQL Server
sqlcmd -S localhost -U sa -P password -Q "SELECT 1;"

# SQLite
sqlite3 /path/to/database.db "SELECT 1;"
```

### Inspect D1 Database

```bash
# List D1 databases
wrangler d1 list

# Query D1 database
wrangler d1 execute my-d1-db --remote --command "SELECT COUNT(*) FROM table_name;"

# Backup D1
wrangler d1 backup create my-d1-db --remote
```

### Review Checkpoint Data

```bash
# Find checkpoint files
find .wrangler/state/v3/migrations -name "*.json" -type f

# View checkpoint content
cat .wrangler/state/v3/migrations/migration-123456.json
```

## Architecture

### Module Structure

```
packages/d1-migrator/
├── src/
│   ├── index.ts                    # Entry point, sealed namespace export
│   ├── types.ts                    # Type definitions
│   ├── cli/                        # CLI components
│   │   ├── MigrateToD1Command.ts  # CLI command definition
│   │   ├── DataMigrator.ts        # Core migration orchestrator
│   │   ├── SchemaAnalyzer.ts      # Source schema introspection
│   │   └── ProgressTracker.ts     # Migration progress tracking
│   ├── schema/                     # Schema conversion
│   │   ├── SchemaBuilder.ts       # Builds D1-compatible schemas
│   │   ├── TypeConverter.ts       # Type transformations
│   │   └── Validator.ts           # Schema validation
│   └── utils/                      # Utilities
│       ├── CheckpointManager.ts   # Resumable migration checkpoints
│       └── DataValidator.ts       # Data integrity validation
└── package.json
```

### Data Flow

```
Source Database
      ↓
[SchemaAnalyzer] ← Introspect tables, columns, keys, indexes
      ↓
Database Schema Object
      ↓
[Compatibility Check] ← Verify D1 support
      ↓
[SchemaBuilder] ← Convert to D1-compatible schema
      ↓
[DataMigrator] ← Migrate data in batches
      ├─ [TypeConverter] ← Transform values
      ├─ [CheckpointManager] ← Save progress
      └─ [DataValidator] ← Verify rows
      ↓
D1 Database
```

## Development

### Building from Source

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Run tests
npm test

# Type checking
npm run type-check

# Linting
npm run lint
```

### Testing Locally

```typescript
// tests/integration/migration.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { D1Migrator } from '@zintrust/d1-migrator';

describe('D1 Migration', () => {
  it('should migrate MySQL data successfully', async () => {
    const config = {
      sourceConnection: process.env.TEST_MYSQL_URL!,
      sourceDriver: 'mysql' as const,
      targetDatabase: 'test-d1',
      targetType: 'd1' as const,
    };

    const progress = await D1Migrator.DataMigrator.migrateData(config);
    expect(progress.status).toBe('completed');
    expect(progress.processedRows).toBeGreaterThan(0);
  });
});
```

## Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](../../CONTRIBUTING.md) for details on our code of conduct and process for submitting pull requests.

### Bug Reports

[GitHub Issues](https://github.com/ZinTrust/zintrust/issues)

## License

MIT License - see [LICENSE.md](../../LICENSE.md) for details

## Support

- **Documentation**: [Full Documentation](../../docs/adapters.md)
- **Issues**: [GitHub Issues](https://github.com/ZinTrust/zintrust/issues)
- **Discussions**: [GitHub Discussions](https://github.com/ZinTrust/zintrust/discussions)
- **Email**: support@zintrust.dev

## Roadmap

- [ ] Resume from checkpoints (in progress)
- [ ] MongoDB source support
- [ ] GraphQL schema introspection
- [ ] Data anonymization during migration
- [ ] Real-time replication mode
- [ ] Web UI for migration management

## Related Packages

- [@zintrust/core](https://www.npmjs.com/package/@zintrust/core) - Core framework
- [@zintrust/db-mysql](https://www.npmjs.com/package/@zintrust/db-mysql) - MySQL adapter
- [@zintrust/db-postgres](https://www.npmjs.com/package/@zintrust/db-postgres) - PostgreSQL adapter
- [@zintrust/db-sqlite](https://www.npmjs.com/package/@zintrust/db-sqlite) - SQLite adapter
- [@zintrust/db-sqlserver](https://www.npmjs.com/package/@zintrust/db-sqlserver) - SQL Server adapter
- [@zintrust/db-d1](https://www.npmjs.com/package/@zintrust/db-d1) - D1 adapter

---

Made with ❤️ by ZinTrust
