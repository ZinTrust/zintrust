# Multi-Database Quick Reference

This is a quick lookup guide. For detailed information, see [docs/multi-database.md](multi-database.md).

## Common Tasks

### Task: Use a model with a specific database

```typescript
// Option 1: Define in model
export const User = Model.define(
  {
    table: 'users',
    connection: 'users_db', // Always uses this connection
  },
  {}
);

// Option 2: Switch at runtime
const user = await User.db('analytics').find(1);
```

### Task: Query a specific database directly

```typescript
import { useEnsureDbConnected } from '@zintrust/core';
import { QueryBuilder } from '@zintrust/core';

const analyticsDb = await useEnsureDbConnected(undefined, 'analytics');
const result = await QueryBuilder.create('events', analyticsDb).where('user_id', '=', 1).get();
```

### Task: Handle different databases in a controller

```typescript
export const MultiDbController = {
  async getUserWithOrders(req: IRequest, res: IResponse) {
    // From users_db
    const user = await User.find(req.params.id);

    // From orders_db
    const ordersDb = await useEnsureDbConnected(undefined, 'orders_db');
    const orders = await QueryBuilder.create('orders', ordersDb)
      .where('user_id', '=', user.getAttribute('id'))
      .get();

    res.json({ user, orders });
  },
};
```

### Task: Implement database sharding

```typescript
import { useEnsureDbConnected } from '@zintrust/core';

export const ShardRouter = {
  getUserShard(userId: number): string {
    const shards = 4;
    return `users_shard_${(userId % shards) + 1}`;
  },

  async getUserDb(userId: number) {
    return useEnsureDbConnected(undefined, ShardRouter.getUserShard(userId));
  },
};

// Usage
const shard = await ShardRouter.getUserDb(userId);
const user = await QueryBuilder.create('users', shard).where('id', '=', userId).first();
```

### Task: Load data from multiple databases

```typescript
const user = await User.find(1); // From users_db
const analytics = await AnalyticsEvent.db('analytics').where('user_id', '=', 1).get(); // From analytics db
const orders = await Order.find(1); // From orders_db
```

## Configuration

### Define connections in `src/config/database.ts`

```typescript
const connections = {
  postgresql: { driver: 'postgresql', host: '...' /* ... */ },
  analytics: { driver: 'postgresql', host: 'analytics.example.com' /* ... */ },
  users_db: { driver: 'mysql', host: 'users-shard-1.example.com' /* ... */ },
  orders_db: { driver: 'mysql', host: 'orders-shard-1.example.com' /* ... */ },
};
```

### Register during app startup

```typescript
import { useDatabase } from '@zintrust/core';
import { DatabaseConfig } from '@config/database';

for (const [name, config] of Object.entries(DatabaseConfig.connections)) {
  const db = useDatabase(config, name);
  await db.connect();
}
```

## Connection Methods

| Method                                 | Use Case                              | Example                                           |
| -------------------------------------- | ------------------------------------- | ------------------------------------------------- |
| Model config `connection: 'name'`      | All model operations use specific DB  | `User.find(1)` uses defined connection            |
| `.db('name')` on model                 | Temporarily switch for one operation  | `User.db('analytics').find(1)`                    |
| `QueryBuilder.create(table, db)`       | Direct query builder with specific DB | `QueryBuilder.create('users', analyticsDb).get()` |
| `useEnsureDbConnected(config, 'name')` | Get database instance                 | Get DB to pass to QueryBuilder                    |

## API Methods on Models

All QueryBuilder methods are available directly on models:

```typescript
// Where variants
User.where('role', '=', 'admin');
User.whereIn('id', [1, 2, 3]);
User.whereNotIn('id', [1, 2, 3]);
User.andWhere('status', '=', 'active');
User.orWhere('role', '=', 'superuser');

// Selection
User.select('id', 'name', 'email');
User.selectAs('full_name', 'name');
User.max('age');

// Ordering/Pagination
User.orderBy('created_at', 'DESC');
User.limit(10);
User.offset(20);

// Joining
User.join('posts', 'posts.user_id = users.id');
User.leftJoin('profiles', 'profiles.user_id = users.id');

// Soft deletes
User.withTrashed();
User.onlyTrashed();
User.withoutTrashed();

// All chainable
await User.where('role', '=', 'admin')
  .whereIn('status', ['active', 'pending'])
  .select('id', 'name', 'email')
  .orderBy('created_at', 'DESC')
  .limit(20)
  .get();
```

## Best Practices Checklist

- ✅ Define `connection` in model config if model uses non-default database
- ✅ Document which database each model uses
- ✅ Use `.db('name')` for runtime switches, not for every operation
- ✅ Always register connections during app startup
- ✅ Handle database failures with try/catch
- ✅ Use `useEnsureDbConnected()` to auto-connect if needed
- ✅ For sharding, encapsulate shard routing logic
- ✅ Keep transactions scoped to single database
- ✅ Log slow queries to identify bottlenecks
- ✅ Test with actual database configurations

## Troubleshooting

**Error: Database connection 'xyz' is not registered**
→ Call `useDatabase(config, 'xyz')` during app startup

**Error: Type 'DefinedModel' has no property 'db'**
→ Make sure you're using the convenience methods; `db()` is on static models

**Queries are slow**
→ Enable query logging: `db.onAfterQuery((sql, _, duration) => Logger.warn(...))` if duration > threshold

**Read replicas not being used**
→ Ensure `readHosts` is configured in database connection; read queries automatically round-robin

**Data inconsistency between databases**
→ Cross-database transactions are not supported; use compensation logic or ensure eventual consistency
