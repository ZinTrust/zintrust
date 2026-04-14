---
title: MySQL Database Adapter
description: MySQL adapter for ZinTrust's database system
---

# MySQL Database Adapter

The `@zintrust/db-mysql` package provides a MySQL driver for ZinTrust's database system, enabling robust MySQL database operations.

## Installation

```bash
zin add  @zintrust/db-mysql
```

## Configuration

Add the MySQL database configuration to your environment:

```typescript
// config/database.ts
import { DatabaseConfig } from '@zintrust/core';

export const database: DatabaseConfig = {
  driver: 'mysql',
  mysql: {
    host: process.env.MYSQL_HOST || 'localhost',
    port: parseInt(process.env.MYSQL_PORT || '3306'),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
    charset: 'utf8mb4',
    timezone: '+00:00',
    acquireTimeout: 60000,
    timeout: 60000,
    reconnect: true,
    connectionLimit: 10,
  },
};
```

## Environment Variables

```bash
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=your_username
MYSQL_PASSWORD=your_password
MYSQL_DATABASE=your_database
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
  },
});

// Create operations
const user = await User.create({
  name: 'John Doe',
  email: 'john@example.com',
});

// Query operations
const users = await User.where('name', 'John').get();
const user = await User.find(1);

// Update operations
await User.where('id', 1).update({ name: 'Jane Doe' });

// Delete operations
await User.where('id', 1).delete();

// Raw queries
const results = await Model.raw('SELECT * FROM users WHERE active = ?', [true]);
```

## Features

- **Connection Pooling**: Efficient connection management
- **Transactions**: ACID transaction support
- **Prepared Statements**: SQL injection protection
- **Type Safety**: Full TypeScript support
- **Migrations**: Database migration support
- **Query Builder**: Fluent query interface
- **Relationships**: Model relationships support

## Options

| Option            | Type   | Default     | Description        |
| ----------------- | ------ | ----------- | ------------------ |
| `host`            | string | 'localhost' | MySQL host         |
| `port`            | number | 3306        | MySQL port         |
| `user`            | string | required    | MySQL username     |
| `password`        | string | required    | MySQL password     |
| `database`        | string | required    | Database name      |
| `charset`         | string | 'utf8mb4'   | Character set      |
| `timezone`        | string | '+00:00'    | Timezone           |
| `connectionLimit` | number | 10          | Max connections    |
| `acquireTimeout`  | number | 60000       | Connection timeout |
| `timeout`         | number | 60000       | Query timeout      |

## Advanced Configuration

### SSL Configuration

```typescript
export const database: DatabaseConfig = {
  driver: 'mysql',
  mysql: {
    // ... other config
    ssl: {
      rejectUnauthorized: true,
      ca: fs.readFileSync('/path/to/ca-cert.pem'),
    },
  },
};
```

### Read Replicas

```typescript
export const database: DatabaseConfig = {
  driver: 'mysql',
  mysql: {
    write: {
      host: 'master-db.example.com',
      // ... master config
    },
    read: [
      {
        host: 'replica-1.example.com',
        // ... replica config
      },
      {
        host: 'replica-2.example.com',
        // ... replica config
      },
    ],
  },
};
```

## Transactions

```typescript
import { Database, QueryBuilder } from '@zintrust/core';

// Simple transaction
await Database.transaction(async (trx) => {
  await QueryBuilder.create('users', trx).insert({ name: 'John' });
  await QueryBuilder.create('users', trx).insert({ name: 'Jane' });
});

// Manual transaction control
const trx = await Database.beginTransaction();
try {
  await QueryBuilder.create('users', trx).insert({ name: 'John' });
  await QueryBuilder.create('users', trx).insert({ name: 'Jane' });
  await trx.commit();
} catch (error) {
  await trx.rollback();
  throw error;
}
```

## Migrations

```typescript
// migrations/001_create_users_table.ts
export const up = async (db) => {
  await db.schema.createTable('users', (table) => {
    table.increments('id').primary();
    table.string('name').notNullable();
    table.string('email').unique().notNullable();
    table.timestamps(true, true);
  });
};

export const down = async (db) => {
  await db.schema.dropTable('users');
};
```

## Performance Optimization

1. **Connection Pooling**: Configure appropriate pool size
2. **Indexing**: Add database indexes for frequently queried columns
3. **Query Optimization**: Use EXPLAIN to analyze queries
4. **Batch Operations**: Use bulk inserts/updates
5. **Prepared Statements**: Reuse prepared statements

## Error Handling

The MySQL adapter handles:

- Connection failures
- Deadlock detection
- Timeout errors
- Constraint violations
- Syntax errors
- Network issues

## Security Features

- **SQL Injection Prevention**: Prepared statements
- **Connection Encryption**: SSL/TLS support
- **Authentication**: Secure password handling
- **Access Control**: Database-level permissions
