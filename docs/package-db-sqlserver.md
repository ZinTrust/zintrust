---
title: SQL Server Database Adapter
description: SQL Server adapter for ZinTrust's database system
---

# SQL Server Database Adapter

The `@zintrust/db-sqlserver` package provides a Microsoft SQL Server driver for ZinTrust's database system, enabling robust SQL Server database operations.

## Installation

```bash
zin add  @zintrust/db-sqlserver
```

## Configuration

Add the SQL Server database configuration to your environment:

```typescript
// config/database.ts
import { DatabaseConfig } from '@zintrust/core';

export const database: DatabaseConfig = {
  driver: 'sqlserver',
  sqlserver: {
    server: process.env.SQLSERVER_SERVER || 'localhost',
    port: parseInt(process.env.SQLSERVER_PORT || '1433'),
    user: process.env.SQLSERVER_USER,
    password: process.env.SQLSERVER_PASSWORD,
    database: process.env.SQLSERVER_DATABASE,
    domain: process.env.SQLSERVER_DOMAIN,
    encrypt: process.env.SQLSERVER_ENCRYPT === 'true',
    trustServerCertificate: process.env.SQLSERVER_TRUST_CERT === 'true',
    connectionTimeout: 60000,
    requestTimeout: 60000,
    pool: {
      max: 10,
      min: 0,
      idleTimeoutMillis: 30000,
    },
  },
};
```

## Environment Variables

```bash
SQLSERVER_SERVER=localhost
SQLSERVER_PORT=1433
SQLSERVER_USER=your_username
SQLSERVER_PASSWORD=your_password
SQLSERVER_DATABASE=your_database
SQLSERVER_ENCRYPT=false
SQLSERVER_TRUST_CERT=false
```

## Usage

```typescript
import { Model } from '@zintrust/core';

// Define a model
const User = Model.define({
  tableName: 'users',
  schema: {
    id: { type: 'number', primary: true, autoIncrement: true },
    name: { type: 'string', required: true, maxLength: 255 },
    email: { type: 'string', required: true, unique: true, maxLength: 255 },
    created_at: { type: 'datetime', default: () => new Date() },
    metadata: { type: 'json' }, // JSON support via NVARCHAR(MAX)
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

// Raw queries with SQL Server-specific features
const results = await Model.raw(`
  SELECT *, JSON_VALUE(metadata, '$.theme') as theme
  FROM users
  WHERE JSON_VALUE(metadata, '$.status') = 'active'
`);
```

## Features

- **Connection Pooling**: Efficient connection management
- **Transactions**: ACID transaction support
- **Prepared Statements**: SQL injection protection
- **Type Safety**: Full TypeScript support
- **JSON Support**: SQL Server JSON functions
- **Full-Text Search**: SQL Server Full-Text Search
- **Migrations**: Database migration support
- **Windows Authentication**: Integrated Windows auth support

## Options

| Option                   | Type    | Default   | Description              |
| ------------------------ | ------- | --------- | ------------------------ |
| `server`                 | string  | required  | SQL Server host          |
| `port`                   | number  | 1433      | SQL Server port          |
| `user`                   | string  | required  | SQL Server username      |
| `password`               | string  | required  | SQL Server password      |
| `database`               | string  | required  | Database name            |
| `domain`                 | string  | undefined | Windows domain           |
| `encrypt`                | boolean | false     | Enable encryption        |
| `trustServerCertificate` | boolean | false     | Trust server certificate |
| `connectionTimeout`      | number  | 60000     | Connection timeout       |
| `requestTimeout`         | number  | 60000     | Request timeout          |

## Advanced Configuration

### Windows Authentication

```typescript
export const database: DatabaseConfig = {
  driver: 'sqlserver',
  sqlserver: {
    server: 'localhost',
    domain: 'CORP',
    authentication: {
      type: 'ntlm',
      options: {
        domain: 'CORP',
        userName: 'user',
        password: 'pass',
      },
    },
  },
};
```

### Azure SQL Database

```typescript
export const database: DatabaseConfig = {
  driver: 'sqlserver',
  sqlserver: {
    server: 'your-server.database.windows.net',
    database: 'your-database',
    user: 'your-user@your-server',
    password: 'your-password',
    encrypt: true,
    trustServerCertificate: false,
  },
};
```

### Connection String

```typescript
export const database: DatabaseConfig = {
  driver: 'sqlserver',
  sqlserver: {
    connectionString: process.env.SQLSERVER_CONNECTION_STRING,
  },
};
```

## SQL Server-Specific Features

### JSON Operations

```typescript
// JSON queries using SQL Server JSON functions
const usersWithPreferences = await Model.raw(`
  SELECT * FROM users
  WHERE JSON_VALUE(metadata, '$.theme') = 'dark'
`);

// JSON path queries
const nestedData = await Model.raw(`
  SELECT JSON_VALUE(metadata, '$.preferences.theme') as theme
  FROM users
`);

// Update JSON fields
await Model.raw(
  `
  UPDATE users
  SET metadata = JSON_MODIFY(metadata, '$.last_login', ?)
  WHERE id = ?
`,
  [new Date().toISOString(), 1]
);

// JSON array operations
const usersWithTags = await Model.raw(`
  SELECT * FROM users
  WHERE EXISTS (
    SELECT 1 FROM OPENJSON(metadata, '$.tags')
    WHERE value = 'admin'
  )
`);
```

### Full-Text Search

```typescript
// Create full-text catalog and index
await Model.raw(`
  CREATE FULLTEXT CATALOG ft_catalog AS DEFAULT;
  CREATE FULLTEXT INDEX ON users(name, email) KEY INDEX PK_users;
`);

// Search with ranking
const searchResults = await Model.raw(
  `
  SELECT *, FT_RANK as rank
  FROM users
  WHERE CONTAINS((name, email), ?)
  ORDER BY FT_RANK DESC
`,
  ['john']
);

// FREETEXT search
const fuzzyResults = await Model.raw(
  `
  SELECT * FROM users
  WHERE FREETEXT((name, email), ?)
`,
  ['john doe']
);
```

### Table-Valued Parameters

```typescript
// Bulk insert using TVP
const userData = [
  { name: 'John', email: 'john@example.com' },
  { name: 'Jane', email: 'jane@example.com' },
];

await Model.raw(
  `
  INSERT INTO users (name, email)
  SELECT name, email FROM @userData
`,
  {
    userData: userData,
  }
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

// Transaction isolation levels
await Database.transaction(async (trx) => {
  await trx.raw('SET TRANSACTION ISOLATION LEVEL SERIALIZABLE');
  // ... operations
});
```

## Migrations

```typescript
// migrations/001_create_users_table.ts
export const up = async (db) => {
  await db.schema.createTable('users', (table) => {
    table.increments('id').primary();
    table.string('name', 255).notNullable();
    table.string('email', 255).unique().notNullable();
    table.text('metadata'); // JSON stored as NVARCHAR(MAX)
    table.timestamps(true, true);

    // Indexes
    table.index(['email'], 'idx_email');
  });

  // Create full-text index
  await db.raw(`
    CREATE FULLTEXT INDEX ON users(name, email) KEY INDEX PK_users
  `);
};

export const down = async (db) => {
  await db.schema.dropTable('users');
};
```

## Performance Optimization

1. **Connection Pooling**: Configure appropriate pool size
2. **Indexing**: Use appropriate indexes (clustered, non-clustered)
3. **Query Optimization**: Use execution plans
4. **Batch Operations**: Use table-valued parameters
5. **Statistics**: Keep statistics up to date
6. **Partitioning**: Consider table partitioning for large datasets

## Error Handling

The SQL Server adapter handles:

- Connection failures
- Deadlock detection
- Timeout errors
- Constraint violations
- Syntax errors
- Network issues
- Authentication errors

## Security Features

- **SQL Injection Prevention**: Prepared statements
- **Connection Encryption**: SSL/TLS support
- **Authentication**: Windows and SQL Server authentication
- **Row-Level Security**: SQL Server RLS support
- **Audit Logging**: SQL Server Audit capabilities

## Monitoring and Diagnostics

```typescript
// Query performance analysis
await Model.raw(`
  SET STATISTICS IO ON;
  SET STATISTICS TIME ON;
  SELECT * FROM users WHERE name = 'John';
`);

// Deadlock monitoring
await Model.raw(`
  SELECT * FROM sys.dm_tran_locks
  WHERE request_session_id = @@SPID
`);
```

## Limitations

- **JSON Functions**: Limited to SQL Server 2016+
- **Full-Text Search**: Requires full-text catalog setup
- **Row Size**: 8KB row size limit
- **Concurrent Connections**: Limited by licensing
