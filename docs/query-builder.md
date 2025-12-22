# Query Builder

Zintrust's Query Builder provides a fluent, type-safe interface for building SQL queries. It protects your application against SQL injection attacks.

## Basic Usage

```typescript
import { db } from '@database/Database';

const users = await db.table('users').get();
```

## Master-Slave Splitting

Zintrust automatically handles read/write splitting if you configure multiple read hosts.

### Configuration

```env
DB_CONNECTION=mysql
DB_HOST=master-host
DB_READ_HOSTS=slave-1,slave-2
```

### Automatic Routing

The `QueryBuilder` detects if an operation is a "read" (SELECT) and routes it to one of the slave hosts using a round-robin strategy. Write operations (INSERT, UPDATE, DELETE) are always routed to the master host.

```typescript
// Routed to a slave host
const users = await User.query().get();

// Routed to the master host
const user = new User({ name: 'John' });
await user.save();
```

## Where Clauses

```typescript
const users = await db
  .table('users')
  .where('active', true)
  .where('votes', '>', 100)
  .orWhere('name', 'John')
  .get();
```

## Joins

```typescript
const users = await db
  .table('users')
  .join('contacts', 'users.id', '=', 'contacts.user_id')
  .select('users.*', 'contacts.phone')
  .get();
```

## Aggregates

```typescript
const count = await db.table('users').count();
const max = await db.table('users').max('votes');
const avg = await db.table('users').avg('age');
```

## Raw Expressions

Sometimes you may need to use a raw expression in a query:

```typescript
const users = await db
  .table('users')
  .select(db.raw('count(*) as user_count, status'))
  .groupBy('status')
  .get();
```
