# Cloudflare Integration

Zintrust is optimized for Cloudflare Workers, providing native support for D1 databases and KV storage.

## How Workers bindings are accessed

In Cloudflare Workers, bindings are provided to the `fetch()` handler as the `_env` argument.

Zintrust makes these bindings available to framework code by copying the Worker env object onto a global:

- The Cloudflare entrypoint sets `globalThis.env = _env`
- Framework components (database/cache) read bindings from `globalThis.env`

To keep runtime-specific global access centralized, Zintrust provides a small helper module:

- `src/config/cloudflare.ts`

This module is used by adapters/drivers to resolve bindings without duplicating Workers-specific logic.

## D1 Database

Cloudflare D1 is a native serverless SQL database. Zintrust provides a dedicated adapter to use D1 as your primary ORM database.

### Configuration

In your `wrangler.jsonc` (or `wrangler.toml`), define your D1 binding:

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

In your `.env` or `Env` class, set the connection driver:

```env
DB_CONNECTION=d1
```

The D1 adapter expects the D1 binding name to be `DB` (as shown in the Wrangler config above).

### Migrations

Zintrust includes a CLI command to manage D1 migrations via Wrangler:

```bash
# Run migrations locally
zin d1:migrate --local

# Run migrations on remote D1
zin d1:migrate --remote
```

## KV Storage

Cloudflare KV is a low-latency key-value store. You can use it as a cache driver in Zintrust.

### Configuration

In your `wrangler.jsonc`, define your KV binding:

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

Set the cache driver to `kv`:

```env
CACHE_DRIVER=kv
```

The KV driver expects the KV namespace binding name to be `CACHE` (as shown in the Wrangler config above).

## Deployment

To deploy your Zintrust application to Cloudflare Workers:

```bash
npm run deploy
```

This will use Wrangler to bundle and upload your application to the Cloudflare edge.

Because the Wrangler config defines multiple environments, deployments should always specify a target environment. `npm run deploy` defaults to `production`.

```bash
# Deploy to production
WRANGLER_ENV=production npm run deploy

# Deploy to development
WRANGLER_ENV=development npm run deploy
```
