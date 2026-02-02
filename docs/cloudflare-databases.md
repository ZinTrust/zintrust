# Cloudflare Workers Databases (ZinTrust)

This guide explains how to use PostgreSQL and MySQL adapters on Cloudflare Workers with `cloudflare:sockets`.

## Prerequisites

- `compatibility_date >= 2024-01-15`
- `compatibility_flags: ["nodejs_compat"]`
- Environment flag: `ENABLE_CLOUDFLARE_SOCKETS=true`

## PostgreSQL

### Config

```ts
const config = {
  driver: 'postgresql',
  host: 'db.example.com',
  port: 5432,
  database: 'app',
  username: 'app',
  password: 'secret',
  ssl: true,
  socketTimeoutMs: 30000,
};
```

### Notes

- Socket creation occurs per request.
- Use public hostnames (no private IP ranges).

## MySQL

### Config

```ts
const config = {
  driver: 'mysql',
  host: 'db.example.com',
  port: 3306,
  database: 'app',
  username: 'app',
  password: 'secret',
  ssl: true,
  socketTimeoutMs: 30000,
};
```

### Connection string support

```ts
const config = {
  driver: 'mysql',
  connectionString: 'mysql://app:secret@db.example.com:3306/app',
  socketTimeoutMs: 30000,
};
```

## Troubleshooting

- If you see `cloudflare:sockets` errors, verify compatibility date and feature flag.
- If connections fail, confirm your database is reachable from a public IP.

## Common Errors

- **`Cloudflare sockets are disabled`**: set `ENABLE_CLOUDFLARE_SOCKETS=true`.
- **`Cloudflare socket connection timed out`**: increase `socketTimeoutMs` or check network reachability.
- **`Cannot find module 'cloudflare:sockets'`**: update `compatibility_date` and `nodejs_compat`.
