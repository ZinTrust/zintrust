# Cloudflare Integration

Zintrust is optimized for Cloudflare Workers, providing native support for D1 databases and KV storage.

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

## Deployment

To deploy your Zintrust application to Cloudflare Workers:

```bash
npm run deploy
```

This will use Wrangler to bundle and upload your application to the Cloudflare edge.
