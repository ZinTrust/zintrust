# Advanced Database Guide

This document covers advanced database topics in Zintrust:

- Multi-database (named connections)
- Cloudflare D1 integration
- Cloudflare KV caching
- Connection pooling and read replica routing

It complements:

- `docs/models.md` (model definition + connection usage)
- `docs/query-builder.md` (query builder usage)
- `docs/cloudflare.md` (Workers bindings, D1, KV)
- `docs/cache.md` (cache drivers)

## Multi-Database (Named Connections)

Zintrust supports multiple database connections by name.

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

## Cloudflare D1

Zintrust includes a dedicated `d1` database driver via `src/orm/adapters/D1Adapter.ts`.

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

Zintrust resolves Workers bindings using `src/config/cloudflare.ts`.

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

Cloudflare D1 is strictly asynchronous. Zintrust’s DB contract is already Promise-based, so D1 fits naturally.

Practical notes:

- Prefer QueryBuilder/ORM APIs; avoid raw SQL unless necessary.
- Keep transactions scoped and short (Workers are request-scoped).
- D1 does not use connection pooling; treat it as a request-scoped binding.

## Cloudflare KV Cache

Zintrust supports Cloudflare KV as a cache backend via the `kv` cache driver.

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

For supported SQL drivers, you can configure read replicas via `readHosts` (or env-based equivalents) and Zintrust will round-robin reads.

See `docs/query-builder.md` for the high-level behavior.

## Connection Pooling

In non-serverless environments, pooling is handled per-connection instance.

Guidelines:

- Create separate named connections for separate pools.
- Keep pool tuning (min/max/idle timeouts) consistent per connection.
- On Cloudflare D1: do not pool (D1 is a binding, not a TCP connection).

## R2 note

Cloudflare R2 is not implemented yet in Zintrust (no binding helper/driver is provided today).
