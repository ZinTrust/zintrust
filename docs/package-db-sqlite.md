---
title: SQLite Database Adapter
description: SQLite adapter for ZinTrust's database system
---

# SQLite Database Adapter

The `@zintrust/db-sqlite` package provides a SQLite driver for ZinTrust's database system, enabling lightweight, file-based database operations.

## Installation

```bash
zin add  @zintrust/db-sqlite
```

## Configuration

Add the SQLite database configuration to your environment:

```typescript
// config/database.ts
import { DatabaseConfig } from '@zintrust/core';

export const database: DatabaseConfig = {
  driver: 'sqlite',
  sqlite: {
    filename: process.env.SQLITE_FILENAME || './database.sqlite',
    options: {
      verbose: process.env.NODE_ENV === 'development' ? console.log : undefined,
      baseDir: process.env.SQLITE_BASE_DIR,
      busyTimeout: 30000,
      maxConnections: 1,
    },
  },
};
```

## Environment Variables

```bash
SQLITE_FILENAME=./database.sqlite
SQLITE_BASE_DIR=./data
NODE_ENV=development
```

## Usage

```typescript
import { Model } from '@zintrust/core';

// Define a model
const User = Model.define({
  tableName: 'users',
  schema: {
    id: { type: 'number', primary: true, autoIncrement: true },
    name: { type: 'string', required: true },
    email: { type: 'string', required: true, unique: true },
    created_at: { type: 'datetime', default: () => new Date() },
    metadata: { type: 'json' }, // JSON support via TEXT
  },
});

// Create operations
const user = await User.create({
  name: 'John Doe',
  email: 'john@example.com',
  metadata: { preferences: { theme: 'dark' } },
});

// Query operations
const users = await User.where('name', 'John').get();
const user = await User.find(1);

// Update operations
await User.where('id', 1).update({ name: 'Jane Doe' });

// Delete operations
await User.where('id', 1).delete();

// Raw queries with SQLite-specific features
const results = await Model.raw(`
  SELECT *, json_extract(metadata, '$.theme') as theme
  FROM users
  WHERE json_extract(metadata, '$.status') = 'active'
`);
```

## Features

- **File-Based**: No server required, file-based storage
- **Zero Configuration**: Ready to use out of the box
- **ACID Compliant**: Full ACID transaction support
- **Type Safety**: Full TypeScript support
- **JSON Support**: JSON operations via SQLite JSON1 extension
- **Full-Text Search**: SQLite FTS5 support
- **Migrations**: Database migration support
- **Memory Mode**: In-memory database support

## Options

| Option           | Type     | Default   | Description                           |
| ---------------- | -------- | --------- | ------------------------------------- |
| `filename`       | string   | required  | Database file path                    |
| `baseDir`        | string   | undefined | Base directory for database files     |
| `busyTimeout`    | number   | 30000     | Busy timeout in ms                    |
| `maxConnections` | number   | 1         | Max connections (SQLite recommends 1) |
| `verbose`        | function | undefined | Logging function                      |
| `foreignKeys`    | boolean  | true      | Enable foreign key constraints        |

## Advanced Configuration

### Memory Database

```typescript
export const database: DatabaseConfig = {
  driver: 'sqlite',
  sqlite: {
    filename: ':memory:', // In-memory database
    options: {
      foreignKeys: true,
    },
  },
};
```

### Temporary Database

```typescript
export const database: DatabaseConfig = {
  driver: 'sqlite',
  sqlite: {
    filename: '', // Temporary database
  },
};
```

### WAL Mode (Write-Ahead Logging)

```typescript
export const database: DatabaseConfig = {
  driver: 'sqlite',
  sqlite: {
    filename: './database.sqlite',
    options: {
      // Enable WAL mode for better concurrency
      pragma: {
        journal_mode: 'WAL',
        synchronous: 'NORMAL',
        cache_size: 1000,
        temp_store: 'MEMORY',
      },
    },
  },
};
```

## SQLite-Specific Features

### JSON Operations

```typescript
// JSON queries using SQLite JSON1 extension
const usersWithPreferences = await Model.raw(`
  SELECT * FROM users
  WHERE json_extract(metadata, '$.theme') = 'dark'
`);

// JSON path queries
const nestedData = await Model.raw(`
  SELECT json_extract(metadata, '$.preferences.theme') as theme
  FROM users
`);

// Update JSON fields
await Model.raw(
  `
  UPDATE users
  SET metadata = json_set(metadata, '$.last_login', ?)
  WHERE id = ?
`,
  [new Date().toISOString(), 1]
);
```

### Full-Text Search

```typescript
// Create FTS5 virtual table
await Model.raw(`
  CREATE VIRTUAL TABLE users_fts USING fts5(name, email, content='users', content_rowid='id')
`);

// Trigger to keep FTS table updated
await Model.raw(`
  CREATE TRIGGER users_fts_insert AFTER INSERT ON users BEGIN
    INSERT INTO users_fts(rowid, name, email) VALUES (new.id, new.name, new.email);
  END
`);

// Search
const searchResults = await Model.raw(
  `
  SELECT users.* FROM users_fts
  JOIN users ON users.id = users_fts.rowid
  WHERE users_fts MATCH ?
  ORDER BY rank
`,
  ['john']
);
```

## Transactions

```typescript
import { Database, QueryBuilder } from '@zintrust/core';

// Simple transaction
await Database.transaction(async (trx) => {
  await QueryBuilder.create('users', trx).insert({ name: 'John' });
  await QueryBuilder.create('users', trx).insert({ name: 'Jane' });
});

// Savepoints
await Database.transaction(async (trx) => {
  await trx.savepoint('user_created');

  try {
    await QueryBuilder.create('users', trx).insert({ name: 'Bob' });
    await trx.release('user_created');
  } catch (error) {
    await trx.rollbackToSavepoint('user_created');
  }
});
```

## Migrations

```typescript
// migrations/001_create_users_table.ts
export const up = async (db) => {
  await db.schema.createTable('users', (table) => {
    table.increments('id').primary();
    table.string('name').notNullable();
    table.string('email').unique().notNullable();
    table.text('metadata'); // JSON stored as TEXT
    table.timestamps(true, true);

    // Indexes
    table.index(['email'], 'idx_email');
  });

  // Create FTS table
  await db.raw(`
    CREATE VIRTUAL TABLE users_fts USING fts5(name, email, content='users', content_rowid='id')
  `);
};

export const down = async (db) => {
  await db.schema.dropTable('users_fts');
  await db.schema.dropTable('users');
};
```

## Performance Optimization

1. **WAL Mode**: Enable WAL for better concurrency
2. **Indexing**: Add appropriate indexes
3. **Pragma Settings**: Optimize SQLite pragmas
4. **Connection Management**: Use connection pooling
5. **Batch Operations**: Use transactions for bulk operations
6. **Memory Management**: Monitor memory usage

## Error Handling

The SQLite adapter handles:

- Database locking errors
- Disk I/O errors
- Constraint violations
- Syntax errors
- Connection issues
- File permission errors

## Security Features

- **SQL Injection Prevention**: Prepared statements
- **File Permissions**: Proper file access controls
- **Encryption**: Database encryption support
- **Backup/Restore**: Built-in backup functions

## Backup and Restore

```typescript
// Create backup
await Model.raw(`
  VACUUM INTO 'backup_database.sqlite'
`);

// Online backup
await Model.raw(`
  BACKUP DATABASE TO 'backup.sqlite'
`);

// Restore from backup
const fs = require('fs');
const backupData = fs.readFileSync('backup.sqlite');
fs.writeFileSync('database.sqlite', backupData);
```

## Limitations

- **Concurrency**: Limited concurrent writes
- **Network Access**: No remote access
- **Stored Procedures**: Limited stored procedure support
- **User Management**: No user management system
