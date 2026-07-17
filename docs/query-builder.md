# Query Builder

ZinTrust's Query Builder provides a fluent, type-safe interface for building SQL queries. Identifiers are allow-listed and values are bound as parameters so application code never concatenates free-form SQL.

Primary entry points:

```typescript
import { QueryBuilder } from '@zintrust/core';
import { User } from '@app/Models/User';

// Model-backed (preferred for app tables)
const users = await User.query().where('active', true).get();

// Ad-hoc table + connection
const rows = await QueryBuilder.create('users', db).where('id', '=', 1).first();
```

`Model.query()` returns an `IQueryBuilder` with soft-delete options applied when the model defines them. Use `QueryBuilder.create(table, db)` when you need a specific database instance (named connections, multi-db).

## Safety model

- **Identifiers** (tables, columns, aliases, join sides, partition columns) must match safe identifier paths (`table`, `table.column`).
- **Operators** are allow-listed (`=`, `!=`, `<>`, `<`, `<=`, `>`, `>=`, `LIKE`, `IN`, `IS`, …).
- **Values** are always bound (`?` placeholders). Column-to-column comparisons use `whereColumn` / join ON — never bind an identifier as a value.
- There is **no** app-facing raw SQL fragment API on QueryBuilder. Prefer structured helpers (`whereExists`, `groupBy`, `latestPer`, allow-listed aggregates in `select`).

## Basic selects and filters

```typescript
const active = await User.query()
  .select('id', 'name', 'email')
  .where('active', true) // shorthand: operator defaults to =
  .where('votes', '>', 100)
  .orWhere('name', '=', 'John')
  .orderBy('created_at', 'DESC')
  .limit(50)
  .get();

const one = await User.query().where('id', '=', id).first();
const required = await User.query().where('id', '=', id).firstOrFail();
```

### Null / in lists

```typescript
await Message.query().whereNull('deleted_for_all_at').get();
await Message.query().whereNotNull('read_at').get();
await Message.query().whereIn('thread_id', threadIds).get();
await Message.query().whereNotIn('status', ['spam', 'blocked']).get();
```

### Grouped predicates

Use `whereGroup()` / `orWhereGroup()` for parenthesised boolean groups:

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

### Normalized text comparison

`whereNormalized(column, value)` compares with `LOWER(TRIM(column))` (configurable) without raw SQL:

```typescript
const user = await User.query()
  .where('tenant_id', '=', tenantId)
  .whereNormalized('email', email)
  .first();
```

## Aggregates in `select`

Allow-listed aggregate expressions in `select(...)`:

```typescript
const rows = await Message.query()
  .select('thread_id', 'COUNT(*) AS total', 'MAX(created_at) AS last_at')
  .groupBy('thread_id')
  .get();
```

Supported forms: `COUNT|SUM|AVG|MIN|MAX(arg)` with optional `AS alias`. `arg` is `*` or a safe identifier path.

You can also use `selectAs(column, alias)` and `max(column, alias?)` helpers.

## Joins

### Single ON term (string)

```typescript
const rows = await QueryBuilder.create('users', db)
  .join('profiles', 'users.id = profiles.user_id')
  .select('users.id', 'users.name', 'profiles.phone')
  .get();
```

`leftJoin` uses the same ON forms.

### Multi-term ON (string with `AND`)

```typescript
const rows = await MessageUserState.query().join(
  'messages',
  'messages.id = message_user_states.message_id AND message_user_states.thread_id = messages.thread_id'
);
```

### Multi-term ON (callback builder — preferred for several predicates)

```typescript
const pinned = await MessageUserState.query()
  .join('messages', (on) =>
    on
      .on('messages.id', '=', 'message_user_states.message_id')
      .on('message_user_states.thread_id', '=', 'messages.thread_id')
  )
  .where('message_user_states.user_id', '=', viewerId)
  .whereNotNull('message_user_states.pinned_at')
  .whereNull('messages.deleted_for_all_at')
  .get();
```

**Note:** Join ON accepts **identifier OP identifier** only. Put bound values (`user_id = ?`) in `where(...)`, not in ON.

## Exists / anti-joins

Correlated subqueries without raw SQL:

```typescript
// Messages the viewer has not soft-hidden
const history = await Message.query()
  .where('thread_id', '=', threadId)
  .whereNull('deleted_for_all_at')
  .whereNotExists((sub) =>
    sub
      .from('message_user_states')
      .whereColumn('message_user_states.message_id', '=', 'messages.id')
      .where('user_id', '=', viewerId)
      .whereNotNull('hidden_at')
  )
  .orderBy('created_at', 'DESC')
  .limit(51)
  .get();
```

Also available: `whereExists(callback)`.

### Rules for exists subqueries

1. Call **`from('side_table')`** inside the callback (required).
2. Correlate with **`whereColumn(left, operator, right)`** (identifier-to-identifier, no binds).
3. Use normal `where` / `whereNull` / `whereNotNull` / `whereIn` / groups for bound filters.
4. Compiles to `EXISTS (SELECT 1 FROM … WHERE …)` / `NOT EXISTS (…)`.

### `whereColumn`

```typescript
.whereColumn('message_user_states.message_id', '=', 'messages.id')
```

Allowed operators: `=`, `!=`, `<>`, `<`, `<=`, `>`, `>=`.

## `groupBy`

```typescript
const unreadByThread = await Message.query()
  .select('thread_id', 'COUNT(*) AS total')
  .whereIn('thread_id', threadIds)
  .whereNull('read_at')
  .whereNotExists((sub) =>
    sub
      .from('message_user_states')
      .whereColumn('message_user_states.message_id', '=', 'messages.id')
      .where('user_id', '=', viewerId)
      .whereNotNull('hidden_at')
  )
  .groupBy('thread_id')
  .get();
```

`groupBy(...columns)` accepts safe identifier paths. Combine with aggregate `select` expressions as shown above.

When `paginate` is used with `groupBy`, totals are computed as:

```sql
SELECT COUNT(*) AS total FROM (<grouped select without limit/offset>) AS "_zt_count"
```

## Latest row per group (`latestPer`)

Inbox-style “newest message per conversation” without N+1 or in-memory reduce:

```typescript
const latestMessages = await Message.query()
  .whereIn('thread_id', threadIds)
  .whereNull('deleted_for_all_at')
  .latestPer('thread_id', {
    orderBy: [
      ['created_at', 'DESC'],
      ['id', 'DESC'],
    ],
  })
  .get();
```

Compiles roughly to:

```sql
SELECT * FROM (
  SELECT *, ROW_NUMBER() OVER (
    PARTITION BY "thread_id"
    ORDER BY "created_at" DESC, "id" DESC
  ) AS "rn"
  FROM "messages"
  WHERE …
) AS "_zt_window"
WHERE "rn" = 1
```

Options:

| Option | Description |
| --- | --- |
| `partitionBy` | First argument: string or string[] of partition columns |
| `orderBy` | Required list of `[column, 'ASC' \| 'DESC']` for the window |
| `alias` | Optional window alias (default `rn`) |

Outer `orderBy` / `limit` / `offset` apply **outside** the window wrap (after `rn = 1`).

Dialects: SQLite 3.25+ / D1, PostgreSQL, MySQL 8+.

## Ordering, limit, offset

```typescript
User.query().orderBy('name', 'ASC').orderBy('id', 'DESC');
User.query().inRandomOrder(); // dialect-aware RANDOM()/RAND()/NEWID()
User.query().limit(20).offset(40);
```

## Pagination

```typescript
const page = await User.query()
  .where('active', true)
  .orderBy('id', 'ASC')
  .paginate(2, 25, {
    baseUrl: '/users',
    query: { q: 'ada' },
  });

// page.items, page.total, page.perPage, page.currentPage, page.lastPage, …
```

### Join-aware totals

When the query has **joins**, the count query includes those joins and uses:

```sql
COUNT(DISTINCT "users"."id")
```

Default distinct column is `<primary_table>.id`. Override when needed:

```typescript
await User.query()
  .join('profiles', 'users.id = profiles.user_id')
  .where('profiles.city', '=', city)
  .paginate(1, 20, {
    baseUrl: '/users',
    countDistinct: 'users.uuid', // optional
  });
```

Without joins, totals remain `SELECT COUNT(*) AS total FROM "table" WHERE …`.

### Grouped / window totals

If the select uses `groupBy` or `latestPer`, paginate counts the rows of the unconstrained result via a subquery (`_zt_count`), not a bare table count.

## Soft deletes

When the model/builder is configured with a soft-delete column:

```typescript
User.query().withTrashed(); // include soft-deleted
User.query().onlyTrashed(); // only soft-deleted
User.query().withoutTrashed(); // default exclude
```

## Eager loading

```typescript
const users = await User.query().with('posts').withCount('posts').get();
```

See [Models](./models.md) and [Advanced relationships](./orm-advanced-relationships.md).

## Writes

```typescript
await User.query().insert({ name: 'Ada', email: 'ada@example.com' });
await User.query().where('id', '=', id).update({ name: 'Grace' });
await User.query().where('id', '=', id).delete();
```

## Master / replica routing

If multiple read hosts are configured, SELECT operations may route to replicas; INSERT/UPDATE/DELETE use the writer. See [Database advanced](./database-advanced.md) and connection config.

```env
DB_CONNECTION=mysql
DB_HOST=master-host
DB_READ_HOSTS=slave-1,slave-2
```

## Introspection (tests / debugging)

```typescript
const qb = User.query().where('id', '=', 1).join('profiles', 'users.id = profiles.user_id');
qb.toSQL(); // compiled SQL with ?
qb.getParameters(); // bound values in order
qb.getJoins(); // { table, on, type }[]
qb.getWhereClauses(); // flattened simple where clauses (groups/exists omitted from flatten)
```

## Product pattern cheat sheet

| Need | API |
| --- | --- |
| Hide / exclude related rows | `whereNotExists` + `whereColumn` + `from` |
| Pinned / multi-key join | `join(table, (on) => on.on(…).on(…))` |
| Counts per parent | `select('parent_id', 'COUNT(*) AS n').groupBy('parent_id')` |
| Latest row per group | `latestPer(partition, { orderBy: […] })` |
| Admin list filtered on joined columns | joins + `paginate` (`COUNT(DISTINCT …)`) |
| Case/trim-insensitive email lookup | `whereNormalized` |

## Related docs

- [Models](./models.md) — model definition, `Model.query()`, relationships
- [Database advanced](./database-advanced.md) — named connections, D1, replicas
- [Multi-database](./multi-database.md) — QueryBuilder with specific connections
- [Security](./security.md) — SQL injection defense-in-depth
