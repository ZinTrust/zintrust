# Query Builder

ZinTrust's Query Builder provides a fluent, type-safe interface for building SQL queries. It protects your application against SQL injection attacks.

## Basic Usage

```typescript
import { db } from '@zintrust/core';

const users = await db.table('users').get();
```

## Master-Slave Splitting

ZinTrust automatically handles read/write splitting if you configure multiple read hosts.

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
const user = await User.create({ name: 'John' });
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

`where()` and `orWhere()` each accept an optional operator (`=`, `>`, `<`, `>=`, `<=`, `!=`). Successive `where()` calls are joined with `AND`; `orWhere()` calls are joined with `OR` at the top level.

## Grouped Predicates

Use `whereGroup()` or `orWhereGroup()` when you need a parenthesised boolean group mixed into a larger condition — for example, `WHERE event_id = ? AND (token = ? OR invite_code = ? OR id = ?)`:

```typescript
const invitation = await GuestInvitation.query()
  .where('event_id', '=', eventId)
  .whereGroup((group) =>
    group
      .where('token', '=', candidate)
      .orWhere('invite_code', '=', candidate)
      .orWhere('id', '=', candidateId)
  )
  .orderBy('id', 'DESC')
  .first();
```

The callback receives a fresh `IQueryBuilder` instance scoped to the group. Use `orWhereGroup()` to join the entire group with `OR` instead of `AND`.

## Normalized Text Comparison

`whereNormalized(column, value)` applies trim- and case-insensitive equality without raw SQL. By default it compiles the column side to `LOWER(TRIM(column))`, then normalizes the bound value in application code before binding. Use it for lookups on user-supplied text fields such as email addresses:

```typescript
const user = await User.query()
  .where('tenant_id', '=', tenantId)
  .whereNormalized('email', email)
  .first();
```

Use `orWhereNormalized(column, value)` to join the normalized predicate with `OR`:

```typescript
const match = await Contact.query()
  .whereNormalized('email', email)
  .orWhereNormalized('alias', email)
  .first();
```

Both helpers accept an optional `NormalizedTextOptions` argument so you can disable trimming or lowercasing when a lookup needs different normalization behavior. They work with SQLite, D1, MySQL, and PostgreSQL adapters.

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
