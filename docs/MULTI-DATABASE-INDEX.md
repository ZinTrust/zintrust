# Multi-Database Documentation Index

ZinTrust now has comprehensive documentation for multi-database connections. Use this index to find what you need.

## Documentation Files

### 1. [docs/multi-database.md](multi-database.md) - Complete Guide (30 KB)

**The definitive reference for everything multi-database.**

Covers:

- Configuration (defining connections, environment variables)
- Using models with different connections (model config, `.db()` method)
- Using QueryBuilder with different connections
- Complete controller examples with multiple databases
- Advanced patterns:
  - Dynamic shard selection
  - Cross-database transactions
  - Fallback/resilience strategies
- Read/write separation with replicas
- Best practices and error handling
- Troubleshooting guide

**Read this if:** You're implementing multi-database features, sharding, analytics, or complex architectures.

---

### 2. [docs/multi-database-quick-ref.md](multi-database-quick-ref.md) - Quick Reference (5.4 KB)

**Fast lookup for common tasks.**

Includes:

- Quick task solutions (code snippets)
- Configuration summary
- Connection methods comparison table
- API methods cheat sheet
- Best practices checklist
- Troubleshooting tips

**Read this if:** You just need a quick code example or want to remember a syntax.

---

### 3. [docs/models.md](models.md) - ORM Documentation (13 KB)

**Updated with multi-database support.**

Covers:

- Model definition and configuration
- Relationships (HasMany, BelongsTo, BelongsToMany)
- Soft deletes and timestamps
- Attribute casting, accessors, mutators
- Model observers (lifecycle hooks)
- Query scopes
- **NEW: Multi-database support section** with examples
- Best practices (8 detailed patterns)
- Testing models

**Read this if:** You're working with models or implementing ORM features.

---

### 4. [docs/config-database.md](config-database.md) - Database Configuration

**Configuration file reference.**

Covers:

- Database connection configuration
- Named connections (multiple databases)
- Read/write separation with replicas
- Connection pooling settings
- **NEW: Link to complete multi-database guide**

**Read this if:** You're setting up database connections in `src/config/database.ts`.

---

## Common Scenarios

### "I have users in one database and orders in another"

→ Start with [docs/multi-database.md - Using Models with Different Connections](multi-database.md#using-models-with-different-connections)

### "I need to shard user data across multiple databases"

→ Read [docs/multi-database.md - Advanced Patterns: Dynamic Shard Selection](multi-database.md#pattern-1-dynamic-shard-selection)

### "I have analytics in a separate database"

→ See [docs/multi-database.md - Complete Controller Example](multi-database.md#complete-controller-example-with-multiple-databases)

### "I want to use read replicas"

→ Check [docs/multi-database.md - Read/Write Separation](multi-database.md#readwrite-separation)

### "How do I switch databases at runtime?"

→ See [docs/models.md - Multi-Database Support](models.md#multi-database-support) or [docs/multi-database-quick-ref.md](multi-database-quick-ref.md)

### "I need to handle database failures gracefully"

→ Read [docs/multi-database.md - Pattern 3: Fallback Database Strategy](multi-database.md#pattern-3-fallback-database-strategy)

### "What's the syntax for .db() method?"

→ Quick ref: [docs/multi-database-quick-ref.md - API Methods on Models](multi-database-quick-ref.md#api-methods-on-models)

---

## Architecture Patterns Covered

### 1. **Single Primary + Analytics Database**

```
Primary DB (postgresql)  ←→  User operations
        ↓
Analytics DB (postgresql)  ←→  Event logging
```

See: [Example in multi-database.md](multi-database.md#method-2-switch-connection-at-runtime-with-db)

### 2. **Sharded Architecture**

```
User Shard 1 (mysql)  ←→  Users 1-1M
User Shard 2 (mysql)  ←→  Users 1M-2M
User Shard 3 (mysql)  ←→  Users 2M-3M
Order Shard 1 (mysql)  ←→  Orders
```

See: [Pattern in multi-database.md](multi-database.md#pattern-1-dynamic-shard-selection)

### 3. **Master-Replica Architecture**

```
Master DB (write)
    ↓
Replica 1 (read)  ←→  Queries round-robin
Replica 2 (read)  ←→  between replicas
Replica 3 (read)
```

See: [Read/Write Separation in multi-database.md](multi-database.md#readwrite-separation)

### 4. **Microservices Pattern**

```
Auth Service  ←→  auth_db (postgresql)
User Service  ←→  users_db (mysql)
Order Service  ←→  orders_db (mysql)
```

See: [Controller Examples in multi-database.md](multi-database.md#in-controllers)

### 5. **Resilient/Fallback Pattern**

```
Primary DB (preferred)
        ↓
    Try primary
        ↓
    Success? → Use it
        ✗
        ↓
    Fallback to Replica
```

See: [Pattern in multi-database.md](multi-database.md#pattern-3-fallback-database-strategy)

---

## Code Examples by Topic

### Defining a Model with a Specific Connection

**File:** docs/multi-database.md (Method 1)

```typescript
export const User = Model.define(
  {
    table: 'users',
    connection: 'users_db', // Always uses this connection
    fillable: ['name', 'email'],
  },
  {}
);
```

### Switching Connection at Runtime

**File:** docs/multi-database-quick-ref.md (Common Tasks)

```typescript
const user = await User.db('analytics').find(1);
const events = await User.db('analytics').where(...).get();
```

### Creating a QueryBuilder for Specific Database

**File:** docs/multi-database.md (Method 1: Direct QueryBuilder)

```typescript
const analyticsDb = await useEnsureDbConnected(undefined, 'analytics');
const metrics = await QueryBuilder.create('user_metrics', analyticsDb)
  .where('total_purchases', '>', 0)
  .orderBy('total_purchases', 'DESC')
  .get();
```

### Sharding Logic

**File:** docs/multi-database.md (Pattern 1: Dynamic Shard Selection)

```typescript
export const ShardRouter = {
  getUserShard(userId: number): string {
    const shardCount = 4;
    const shardIndex = userId % shardCount;
    return `users_shard_${shardIndex + 1}`;
  },

  async getUserDb(userId: number) {
    const shardName = ShardRouter.getUserShard(userId);
    return useEnsureDbConnected(undefined, shardName);
  },
};
```

### Multi-Database Transaction

**File:** docs/multi-database.md (Pattern 2: Cross-Database Transactions)

```typescript
// Create user in users_db
const user = User.create({ name, email });
await user.save();

// Create order in orders_db with transaction
const ordersDb = await useEnsureDbConnected(undefined, 'orders_db');
await ordersDb.transaction(async (db) => {
  await QueryBuilder.create('orders', db).insert({
    user_id: user.getAttribute('id'),
    /* ... */
  });
});
```

---

## Configuration Reference

### Example: Multiple Database Connections

**File:** docs/config-database.md (Example section) and docs/multi-database.md (Configuration section)

```typescript
const connections = {
  sqlite: {
    driver: 'sqlite',
    database: '.zintrust/dbs/zintrust.sqlite',
  },
  postgresql: {
    driver: 'postgresql',
    host: Env.DB_HOST,
    port: Env.DB_PORT,
    database: Env.DB_DATABASE,
    username: Env.DB_USERNAME,
    password: Env.DB_PASSWORD,
    readHosts: ['read-replica-1.example.com', 'read-replica-2.example.com'],
  },
  analytics: {
    driver: 'postgresql',
    host: Env.DB_ANALYTICS_HOST,
    port: Env.DB_ANALYTICS_PORT,
    database: Env.DB_ANALYTICS_DATABASE,
    username: Env.DB_ANALYTICS_USERNAME,
    password: Env.DB_ANALYTICS_PASSWORD,
  },
};
```

### Environment Variables

**File:** docs/multi-database.md (Configuration: Environment Variables)

```bash
# Primary connection
DB_CONNECTION=postgresql
DB_HOST=localhost
DB_PORT=5432
DB_DATABASE=zintrust_main

# Analytics connection
DB_ANALYTICS_HOST=analytics.example.com
DB_ANALYTICS_DATABASE=analytics_db
DB_ANALYTICS_USERNAME=analytics_user
```

---

## Best Practices Summary

**From docs/multi-database.md - Best Practices section:**

1. ✅ Always define `connection` in model config
2. ✅ Document database ownership in JSDoc comments
3. ✅ Handle connection failures gracefully with try/catch
4. ✅ Use transactions for consistency per-database
5. ✅ Monitor connection pool usage and slow queries
6. ✅ Enable query logging during development
7. ✅ For sharding, encapsulate routing logic
8. ✅ Keep cross-database operations idempotent

**From docs/models.md - Best Practices section:**

1. ✅ Use type-safe model methods
2. ✅ Leverage relationships for cleaner code
3. ✅ Use scopes for common query patterns
4. ✅ Validate before saving
5. ✅ Let model manage timestamps
6. ✅ Use soft-deletes for data preservation
7. ✅ Document your models well
8. ✅ Write tests for model methods

---

## Troubleshooting Quick Guide

**File:** docs/multi-database-quick-ref.md (Troubleshooting section)

| Problem                                 | Cause                          | Solution                                                     |
| --------------------------------------- | ------------------------------ | ------------------------------------------------------------ |
| "Database connection not registered"    | Missing startup registration   | Call `useDatabase(config, 'name')` during app init           |
| "Property 'db' not found on Model type" | Using instance method on class | Use on static model: `User.db('name')` not `user.db('name')` |
| Queries are slow                        | No query logging               | Enable logging with `db.onAfterQuery()`                      |
| Read replicas unused                    | Missing `readHosts` config     | Add `readHosts: [...]` to connection config                  |
| Data inconsistency                      | Cross-DB transaction           | Use per-database transactions and compensation logic         |

---

## Related Documentation

- [docs/controllers.md](controllers.md) - Using models and databases in controllers
- [docs/query-builder.md](query-builder.md) - QueryBuilder API reference
- [docs/config-database.md](config-database.md) - Database configuration
- [docs/database-advanced.md](database-advanced.md) - Advanced database features

---

## Quick Navigation

| Need                | Read             | File                                                       |
| ------------------- | ---------------- | ---------------------------------------------------------- |
| Complete guide      | Everything       | [multi-database.md](multi-database.md)                     |
| Quick syntax        | Cheat sheet      | [multi-database-quick-ref.md](multi-database-quick-ref.md) |
| Model features      | ORM guide        | [models.md](models.md)                                     |
| Configuration       | Config reference | [config-database.md](config-database.md)                   |
| Controller patterns | Web layer        | [controllers.md](controllers.md)                           |
| SQL building        | Query API        | [query-builder.md](query-builder.md)                       |

---

## Examples in Real Code

Check these real files in the ZinTrust codebase for working examples:

- [app/Models/User.ts](app/Models/User.ts) - Model definition with relationships
- [app/Models/Post.ts](app/Models/Post.ts) - Related model example
- [app/Controllers/AuthController.ts](app/Controllers/AuthController.ts) - Controller using User model
- [src/config/database.ts](src/config/database.ts) - Database configuration
- [src/orm/Model.ts](src/orm/Model.ts) - ORM implementation (for advanced understanding)

---

**Last Updated:** January 2026
**Documentation Version:** 1.0 (Multi-Database Feature Complete)
