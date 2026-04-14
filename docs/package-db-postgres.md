---
title: PostgreSQL Database Adapter
description: PostgreSQL adapter for ZinTrust's database system
---

# PostgreSQL Database Adapter

The `@zintrust/db-postgres` package provides a PostgreSQL driver for ZinTrust's database system, enabling powerful PostgreSQL database operations.

## Installation

```bash
zin add  @zintrust/db-postgres
```

## Configuration

Add the PostgreSQL database configuration to your environment:

```typescript
// config/database.ts
import { DatabaseConfig } from '@zintrust/core';

export const database: DatabaseConfig = {
  driver: 'postgres',
  postgres: {
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432'),
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
    database: process.env.POSTGRES_DATABASE,
    ssl: process.env.POSTGRES_SSL === 'true',
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  },
};
```

## Environment Variables

```bash
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_USER=your_username
POSTGRES_PASSWORD=your_password
POSTGRES_DATABASE=your_database
POSTGRES_SSL=false
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
    metadata: { type: 'jsonb' }, // PostgreSQL JSONB support
  },
});

// Create operations
const user = await User.create({
  name: 'John Doe',
  email: 'john@example.com',
  metadata: { preferences: { theme: 'dark' } },
});

// Query operations with PostgreSQL-specific features
const users = await User.whereRaw('metadata->>? = ?', ['preferences', 'dark']).get();
const user = await User.find(1);

// JSONB queries
const activeUsers = await User.where("metadata->>'status'", 'active').get();

// Full-text search
const searchResults = await User.whereRaw("to_tsvector('english', name) @@ to_tsquery(?)", [
  'john',
]).get();
```

## Features

- **Connection Pooling**: Efficient connection management with pg-pool
- **Transactions**: ACID transaction support
- **Prepared Statements**: SQL injection protection
- **Type Safety**: Full TypeScript support
- **JSONB Support**: Native PostgreSQL JSON operations
- **Full-Text Search**: PostgreSQL text search capabilities
- **Array Support**: PostgreSQL array type operations
- **Migrations**: Database migration support

## Options

| Option                    | Type    | Default     | Description         |
| ------------------------- | ------- | ----------- | ------------------- |
| `host`                    | string  | 'localhost' | PostgreSQL host     |
| `port`                    | number  | 5432        | PostgreSQL port     |
| `user`                    | string  | required    | PostgreSQL username |
| `password`                | string  | required    | PostgreSQL password |
| `database`                | string  | required    | Database name       |
| `ssl`                     | boolean | false       | Enable SSL          |
| `max`                     | number  | 20          | Max connections     |
| `idleTimeoutMillis`       | number  | 30000       | Idle timeout        |
| `connectionTimeoutMillis` | number  | 2000        | Connection timeout  |

## Advanced Configuration

### SSL Configuration

```typescript
export const database: DatabaseConfig = {
  driver: 'postgres',
  postgres: {
    // ... other config
    ssl: {
      rejectUnauthorized: true,
      ca: fs.readFileSync('/path/to/ca-cert.pem'),
      key: fs.readFileSync('/path/to/client-key.pem'),
      cert: fs.readFileSync('/path/to/client-cert.pem'),
    },
  },
};
```

### Connection String

```typescript
export const database: DatabaseConfig = {
  driver: 'postgres',
  postgres: {
    connectionString: process.env.POSTGRES_URL,
    max: 20,
  },
};
```

## PostgreSQL-Specific Features

### JSONB Operations

```typescript
// Query JSONB fields
const usersWithPreferences = await User.where("metadata->>'theme'", 'dark').get();

// Update JSONB fields
await User.where('id', 1).update({
  metadata: {
    ...user.metadata,
    last_login: new Date(),
  },
});

// JSONB containment queries
const usersWithTags = await User.whereRaw("metadata->'tags' @> ?", ['["admin"]')).get();
```

### Array Operations

```typescript
// Define model with array field
const Post = Model.define({
  tableName: 'posts',
  schema: {
    id: { type: 'number', primary: true },
    title: { type: 'string', required: true },
    tags: { type: 'array' }, // PostgreSQL array
  },
});

// Query array fields
const postsWithTags = await Post.whereRaw('? = ANY(tags)', ['javascript']).get();
```

### Full-Text Search

```typescript
// Create full-text search index
await Model.raw(`
  CREATE INDEX users_search_idx ON users USING gin(to_tsvector('english', name || ' ' || email))
`);

// Search with ranking
const searchResults = await Model.raw(
  `
  SELECT *, ts_rank(to_tsvector('english', name || ' ' || email), to_tsquery(?)) as rank
  FROM users
  WHERE to_tsvector('english', name || ' ' || email) @@ to_tsquery(?)
  ORDER BY rank DESC
`,
  ['john', 'john']
);
```

## Transactions

```typescript
import { Database, QueryBuilder } from '@zintrust/core';

// Savepoints
await Database.transaction(async (trx) => {
  const user = await QueryBuilder.create('users', trx).insert({ name: 'John' });

  await trx.savepoint('user_created');

  try {
    await QueryBuilder.create('users', trx).insert({ name: 'Jane' });
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
    table.jsonb('metadata');
    table.timestamps(true, true);

    // Indexes
    table.index(['metadata'], 'idx_metadata');
    table.index(["(metadata->>'theme')"], 'idx_theme');
  });
};

export const down = async (db) => {
  await db.schema.dropTable('users');
};
```

## Performance Optimization

1. **Connection Pooling**: Configure appropriate pool size
2. **Indexing**: Use appropriate indexes (B-tree, GIN, GiST)
3. **JSONB Optimization**: Use GIN indexes for JSONB
4. **Query Planning**: Use EXPLAIN ANALYZE
5. **Vacuum**: Regular vacuum operations
6. **Partitioning**: Consider table partitioning for large datasets

## Error Handling

The PostgreSQL adapter handles:

- Connection failures
- Deadlock detection
- Timeout errors
- Constraint violations
- Syntax errors
- Network issues
- SSL errors

## Security Features

- **SQL Injection Prevention**: Prepared statements
- **Connection Encryption**: SSL/TLS support
- **Authentication**: SCRAM and other auth methods
- **Row-Level Security**: PostgreSQL RLS support
- **Audit Logging**: Query logging capabilities
