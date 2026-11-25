# Advanced Database Guide

This document covers advanced database topics in ZinTrust:

- Multi-database (named connections)
- Cloudflare D1 integration
- Cloudflare KV caching
- Connection pooling and read replica routing

It complements:

- `docs/models.md` (model definition + connection usage)
- `docs/query-builder.md` (query builder usage — including `whereExists`, multi-term joins, `groupBy`, `latestPer`, join-aware `paginate`)
- `docs/cloudflare.md` (Workers bindings, D1, KV)
- `docs/cache.md` (cache drivers)

## Multi-Database (Named Connections)

ZinTrust supports multiple database connections by name.

### 1) Create/register a named connection

Use `useDatabase(config, name)` to register a connection.

```ts
import { useDatabase } from '@zintrust/core';

useDatabase(
  {
    driver: 'mysql',
    host: 'db.example.com',
    database: 'app',
    username: 'app',
    password: 'secret',
  },
  'external_db'
);
```

### 2) Route a model to a named connection

Set `connection` on `Model.define(...)`.

```ts
import { Model } from '@zintrust/core';

export const ExternalUser = Model.define({
  connection: 'external_db',
  table: 'users',
  fillable: ['name', 'email'],
  hidden: [],
  timestamps: false,
  casts: {},
});
```

### 3) Route ad-hoc queries

If you need to query a table directly (without a model), you can route a query builder by connection.

```ts
import { Model } from '@zintrust/core';

const rows = await Model.query('users', 'external_db').where('active', true).get();
```

## Migrations (Two Supported Styles)

ZinTrust supports two ways to define schema changes in migrations. Pick whichever style you prefer (both run via `zin migrate`).

### Style A (recommended): secure schema builder

This is the newer builder-driven approach (Blueprint/Compiler-backed). It is the default style used by the migration generator.

```ts
import { MigrationSchema, type IDatabase } from '@zintrust/core';

export interface Migration {
  up(db: IDatabase): Promise\<void>;
  down(db: IDatabase): Promise\<void>;
}

export const migration: Migration = {
  async up(db: IDatabase): Promise\<void> {
    const schema = MigrationSchema.create(db);

    await schema.create('users', (table) => {
      table.id();
      table.string('name');
      table.string('email').unique();
      table.timestamps();
    });
  },

  async down(db: IDatabase): Promise\<void> {
    const schema = MigrationSchema.create(db);
    await schema.dropIfExists('users');
  },
};
```

## Cloudflare D1

ZinTrust includes a dedicated `d1` database driver via `src/orm/adapters/D1Adapter.ts`.

### Wrangler binding

D1 bindings must be configured in Wrangler.

```jsonc
{
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "your_db_name",
      "database_id": "your_database_id",
    },
  ],
}
```

ZinTrust resolves Workers bindings using `src/config/cloudflare.ts`.

### Runtime configuration

Set the database driver:

```env
DB_CONNECTION=d1
```

### D1 migrations

Use the provided CLI wrapper (delegates to Wrangler):

```bash
# Local D1 migrations
zin d1:migrate --local

# Remote D1 migrations
zin d1:migrate --remote
```

### D1 considerations (async-only)

Cloudflare D1 is strictly asynchronous. ZinTrust’s DB contract is already Promise-based, so D1 fits naturally.

Practical notes:

- Prefer QueryBuilder/ORM APIs; avoid raw SQL unless necessary.
- Keep transactions scoped and short (Workers are request-scoped).
- D1 does not use connection pooling; treat it as a request-scoped binding.

### D1 `RETURNING` Clause Support

D1 (SQLite) natively supports the `RETURNING` clause on `INSERT`, `UPDATE`, and `DELETE` statements. ZinTrust's D1 adapter automatically detects `RETURNING` in mutating SQL and routes those statements through `.all()` instead of `.run()` to capture returned rows.

#### QueryBuilder `.return()` API

```typescript
// UPDATE with RETURNING
const result = await User.query()
  .where('id', '=', userId)
  .where('google2fa_ts', '=', previousTimeStep)
  .return('id')
  .update({ google2fa_ts: nextTimeStep });
// Returns: { rowCount: 1, rows: [{ id: '...' }] }

// INSERT with RETURNING
const { rowCount, rows } = await User.query()
  .return('id')
  .insert({ email: 'x@y.com', google2fa_ts: 0 });

// DELETE with RETURNING
const { rowCount, rows } = await User.query()
  .where('id', '=', userId)
  .return('id')
  .delete();
```

#### Raw SQL

You can also use `RETURNING` directly in raw queries:

```typescript
const result = await db.query(
  "UPDATE users SET google2fa_ts = ? WHERE id = ? AND google2fa_ts = ? RETURNING id",
  [nextTimeStep, userId, previousTimeStep]
);
// result.rows contains the updated row(s)
```

#### How It Works

Previously, mutating statements with `RETURNING` would return empty rows because the driver used `.run()` which discards `results`. Now:

1. The adapter detects `RETURNING` via `/\breturning\b/iu.test(sql)`
2. For mutating statements with `RETURNING`, it uses `.all()` instead of `.run()`
3. The returned rows are available in `result.rows` and `result.rowCount`

#### Compatibility

- **D1**: Requires `compatibility_date` 2023-08-01 or later (when `results` was added to `D1Result`)
- **SQLite (better-sqlite3)**: Requires SQLite 3.35+ (when `RETURNING` was added)
- **PostgreSQL**: Native support via `RETURNING`
- **MySQL**: Native support since 8.0.20+
- **SQL Server**: Uses `OUTPUT` clause (different syntax, adapter handles translation)

#### CAS Pattern Example (TOTP Verification)

```typescript
// Atomic TOTP verification with CAS + RETURNING
const result = await User.query()
  .where('id', '=', userId)
  .where('google2fa_ts', '=', expectedTimeStep) // CAS check
  .return('id')
  .update({ google2fa_ts: nextTimeStep, last_login: new Date().toISOString() });

if (result.rowCount === 0) {
  // No row matched = invalid/expired TOTP code
  throw new Error('Invalid 2FA code');
}

// result.rows[0].id confirms the user was updated
const userId = result.rows[0].id;
```
## Cloudflare KV Cache

ZinTrust supports Cloudflare KV as a cache backend via the `kv` cache driver.

### Wrangler binding

```jsonc
{
  "kv_namespaces": [
    {
      "binding": "CACHE",
      "id": "your_kv_id",
    },
  ],
}
```

### Runtime configuration

```env
CACHE_DRIVER=kv
```

Implementation notes:

- Driver mapping: `src/cache/cache.ts` resolves `kv` to `src/cache/drivers/KVDriver.ts`.
- Binding name: `KVDriver` expects the Workers binding to be named `CACHE`.

## Read Replicas (Read Hosts)

For supported SQL drivers, you can configure read replicas via `readHosts` (or env-based equivalents) and ZinTrust will round-robin reads.

See `docs/query-builder.md` for the high-level behavior.

## Connection Pooling

In non-serverless environments, pooling is handled per-connection instance.

Guidelines:

- Create separate named connections for separate pools.
- Keep pool tuning (min/max/idle timeouts) consistent per connection.
- On Cloudflare D1: do not pool (D1 is a binding, not a TCP connection).

## R2 note

Cloudflare R2 is not implemented yet in ZinTrust (no binding helper/driver is provided today).
