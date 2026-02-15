# Cloudflare Integration

ZinTrust is optimized for Cloudflare Workers, providing native support for D1 databases and KV storage.

## How Workers bindings are accessed

In Cloudflare Workers, bindings are provided to the `fetch()` handler as the `_env` argument.

ZinTrust makes these bindings available to framework code by copying the Worker env object onto a global:

- The Cloudflare entrypoint sets `globalThis.env = _env`
- Framework components (database/cache) read bindings from `globalThis.env`

To keep runtime-specific global access centralized, ZinTrust provides a small helper module:

- `src/config/cloudflare.ts`

This module is used by adapters/drivers to resolve bindings without duplicating Workers-specific logic.

## D1 Database

Cloudflare D1 is a native serverless SQL database. ZinTrust provides a dedicated adapter to use D1 as your primary ORM database.

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

### Binding name via env (recommended)

If your Wrangler binding is not `DB` (for example `zintrust_db`), set one of these env vars:

```env
# Any one of these is supported
D1_BINDING=zintrust_db
# or
D1_DATABASE_BINDING=zintrust_db
# or
DB_BINDING=zintrust_db
```

D1 binding resolution order is:

1. Explicit adapter config (`config.d1`)
2. Worker/global binding name `DB`
3. Worker/global binding name `zintrust_db`
4. Worker/global binding name from `D1_BINDING`
5. Worker/global binding name from `D1_DATABASE_BINDING`
6. Worker/global binding name from `DB_BINDING`

So developers can keep custom binding names in Wrangler and map them with env without code changes.

### Migrations

ZinTrust includes a CLI command to manage D1 migrations via Wrangler:

```bash
# Run migrations locally
zin d1:migrate --local

# Run migrations on remote D1
zin d1:migrate --remote
```

## KV Storage

Cloudflare KV is a low-latency key-value store. You can use it as a cache driver in ZinTrust.

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

## MySQL outside Cloudflare (HTTP Proxy)

Workers cannot open raw TCP connections, so MySQL must be accessed through an HTTP proxy.

See **[docs/cloudflare-mysql-proxy.md](cloudflare-mysql-proxy.md)** for the full setup, CLI usage, and production guidance.

## Using D1/KV outside Cloudflare (Proxy Services)

D1 and KV are Cloudflare Workers bindings (there is no standard direct TCP connection string like Postgres/Redis).

If your ZinTrust app runs outside Cloudflare but you still want to use D1 and/or KV, deploy the ZinTrust proxy services in Cloudflare and connect over HTTPS:

- D1 remote: `docs/cloudflare-d1-remote.md`
- KV remote: `docs/cloudflare-kv-remote.md`

## Deployment

To deploy your ZinTrust application to Cloudflare Workers:

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
