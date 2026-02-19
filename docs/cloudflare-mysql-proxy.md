# MySQL Proxy for Cloudflare Workers

Cloudflare Workers cannot open raw TCP sockets. That means MySQL drivers that rely on TCP (like `mysql2`) do not work inside Workers. ZinTrust ships a **MySQL HTTP proxy** that runs in a normal Node.js environment and forwards SQL requests to MySQL over TCP.

This document explains when you need the proxy, how it works, and how to run it in development and production.

## When you need this

Use the MySQL proxy when **all** of the following are true:

- Your app runs on Cloudflare Workers (`zin start --wg` / `zin s --wg`, or Wrangler deploy).
- Your database driver is MySQL (`DB_CONNECTION=mysql`).
- Your database proxy is enabled (`USE_MYSQL_PROXY=true`).
- You are **not** using D1.

If you use D1, you do not need this proxy.

## Architecture (high level)

```
Workers app (fetch)  ──HTTP──>  MySQL Proxy (Node.js)  ──TCP──>  MySQL
```

The proxy exposes three HTTP endpoints:

- `POST /zin/mysql/query`
- `POST /zin/mysql/queryOne`
- `POST /zin/mysql/exec`

Optional (registry mode):

- `POST /zin/mysql/statement` → `{ statementId, params }` (no raw SQL over the network)

ZinTrust sends JSON payloads of the form:

```json
{ "sql": "SELECT ...", "params": [ ... ] }
```

For registry mode (`/zin/mysql/statement`), ZinTrust sends:

```json
{ "statementId": "...", "params": [ ... ] }
```

## Quick start (local development)

You have two common setups:

1. **Standalone proxy server** (Node.js process you run yourself)
2. **Cloudflare Containers proxy gateway** (Worker + Docker-backed Containers via Wrangler dev)

### 1) Standalone proxy server

Start the proxy in one terminal:

```bash
zin proxy:mysql

zin proxy:mysql --watch
```

2. Configure your Worker environment (`.env` or `wrangler.jsonc`):

```env
DB_CONNECTION=mysql
MYSQL_PROXY_URL=http://127.0.0.1:8789
```

3. Start the Worker dev server:

```bash
zin start --wg

# short alias
zin s --wg
```

If `MYSQL_PROXY_URL` is missing, the CLI will warn and print a copy‑paste command to start the proxy.

### 2) Cloudflare Containers proxy gateway (recommended for multi-proxy stacks)

If you are using the Cloudflare Containers proxy Worker (`wrangler.containers-proxy.jsonc`), you typically do **not** run `zin proxy:mysql` separately.

Start the Containers proxy gateway:

```bash
zin init:containers-proxy
npm i @zintrust/cloudflare-containers-proxy

zin docker -e staging
```

Then point your Worker app to the gateway path prefix:

```env
DB_CONNECTION=mysql
MYSQL_PROXY_URL=http://127.0.0.1:8787/mysql
```

## CLI options

The proxy command accepts overrides so you can run it without changing `.env`:

```bash
zin proxy:mysql \
  --host 0.0.0.0 \
  --port 8789 \
  --db-host 127.0.0.1 \
  --db-port 3306 \
  --db-name zintrust \
  --db-user root \
  --db-pass secret \
  --connection-limit 10 \
  --max-body-bytes 131072
```

## Required environment variables (Worker)

| Variable          | Purpose               | Example                 |
| ----------------- | --------------------- | ----------------------- |
| `DB_CONNECTION`   | Must be `mysql`       | `mysql`                 |
| `MYSQL_PROXY_URL` | Base URL of the proxy | `http://127.0.0.1:8789` |

## Proxy server environment variables (Node)

| Variable                     | Purpose          | Default     |
| ---------------------------- | ---------------- | ----------- |
| `MYSQL_PROXY_HOST`           | Bind host        | `127.0.0.1` |
| `MYSQL_PROXY_PORT`           | Bind port        | `8789`      |
| `MYSQL_PROXY_MAX_BODY_BYTES` | Max request size | `131072`    |
| `MYSQL_PROXY_POOL_LIMIT`     | MySQL pool size  | `10`        |
| `DB_HOST`                    | MySQL host       | `localhost` |
| `DB_PORT`                    | MySQL port       | `3306`      |
| `DB_DATABASE`                | MySQL database   | `zintrust`  |
| `DB_USERNAME`                | MySQL username   | `root`      |
| `DB_PASSWORD`                | MySQL password   | ``          |

## Optional request signing (recommended for production)

The proxy can require signed requests using ZinTrust’s `SignedRequest` headers.

1. Set credentials on the proxy **and** in the Worker:

```env
MYSQL_PROXY_KEY_ID=my-key
MYSQL_PROXY_SECRET=my-secret
MYSQL_PROXY_REQUIRE_SIGNING=true
```

2. (Optional) tighten the time window:

```env
MYSQL_PROXY_SIGNING_WINDOW_MS=60000
```

When signing is enabled, the Worker will send signed requests automatically. Any unsigned or invalid request is rejected by the proxy.

## Statement registry mode (optional, security-focused)

If you want the proxy to execute only allowlisted statements (and avoid sending SQL text over the network), enable registry mode:

1. Generate a statement registry map (a JSON object of `{ statementId: sql }`).
2. Mount it into the proxy container/VM and point the proxy to it:

```env
ZT_MYSQL_STATEMENTS_FILE=/run/secrets/mysql-statements.json
```

Then call `POST /zin/mysql/statement`.

Security note: registry mode reduces blast radius most when the proxy is a separate trust boundary (see the threat model table in `docs/cloudflare-d1-remote.md`).

## Production deployment

Deploy the proxy anywhere that can reach your MySQL server over TCP:

- A small VM (Linux)
- A container in ECS/Fly/Render
- A private service inside your VPC

Then set `MYSQL_PROXY_URL` in your Worker environment to point at that service over HTTPS.

> You can also run **your own** proxy implementation as long as it respects the endpoint contract above.

## Troubleshooting

- **401/403 from proxy**: signing headers missing or invalid. Check `MYSQL_PROXY_KEY_ID` / `MYSQL_PROXY_SECRET` and clock skew.
- **ECONNREFUSED**: the proxy is not reachable at `MYSQL_PROXY_URL`.
- **MySQL access denied**: verify `DB_USERNAME` / `DB_PASSWORD` on the proxy side.
