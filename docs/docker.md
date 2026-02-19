# Docker

This repository includes a ready-to-use `Dockerfile` and `docker-compose.yml` for containerized development and production builds.

## Quick start (recommended)

Use the provided npm scripts:

```bash
npm run docker:build
npm run docker:up
```

Useful helpers:

- `npm run docker:logs` — tail app logs
- `npm run docker:shell` — open a shell in the app container
- `npm run docker:test` — run tests inside the container
- `npm run docker:down` / `npm run docker:stop`

## Container Workers CLI (cw)

ZinTrust includes a unified CLI flow for the worker container stack.

### Workers stack

```bash
zin init:cw
zin deploy cw
zin deploy:cw
```

Compatibility aliases still work:

```bash
zin init:cwr
zin deploy cwr
zin deploy:cwr
```

## Container Proxies CLI (cp)

ZinTrust includes a unified CLI flow for the proxy gateway + proxy services stack.

### Initialize proxy stack files

```bash
zin init:proxy
```

Aliases:

```bash
zin init:cp
zin init:container-proxies
zin init:py
```

### Deploy / up / down

```bash
zin deploy cp
zin deploy:cp

zin cp build
zin cp up -d
zin cp down
```

Compose target file: `docker-compose.proxy.yml`.

## Cloudflare Containers Proxy Worker (ccp)

This is the Cloudflare-hosted equivalent of the proxy gateway pattern, implemented as a Worker plus container-backed Durable Objects.

Scaffold the dedicated Wrangler config + Worker entry:

```bash
zin init:containers-proxy

# short alias
zin init:ccp
```

Install the runtime package:

```bash
npm i @zintrust/cloudflare-containers-proxy
```

Run locally (Wrangler dev + Docker-backed Containers):

```bash
zin docker -c wrangler.containers-proxy.jsonc -e staging

# short alias
zin dk -e staging
```

The gateway routes by path prefix (mirrors the Compose gateway paths):

```bash
MYSQL_PROXY_URL=http://127.0.0.1:8787/mysql
POSTGRES_PROXY_URL=http://127.0.0.1:8787/postgres
REDIS_PROXY_URL=http://127.0.0.1:8787/redis
MONGODB_PROXY_URL=http://127.0.0.1:8787/mongodb
SQLSERVER_PROXY_URL=http://127.0.0.1:8787/sqlserver
SMTP_PROXY_URL=http://127.0.0.1:8787/smtp
```

If you override the dev server port, update the URLs accordingly (or pass `--port` to `zin docker`).

Deploy:

```bash
zin deploy:ccp -e production

# short alias
zin d:ccp
```

### Proxy gateway endpoint conventions

When using the unified gateway (default port `8800`), point proxy URLs to gateway paths:

```bash
MYSQL_PROXY_URL=http://127.0.0.1:8800/mysql
POSTGRES_PROXY_URL=http://127.0.0.1:8800/postgres
REDIS_PROXY_URL=http://127.0.0.1:8800/redis
MONGODB_PROXY_URL=http://127.0.0.1:8800/mongodb
SQLSERVER_PROXY_URL=http://127.0.0.1:8800/sqlserver
SMTP_PROXY_URL=http://127.0.0.1:8800/smtp
```

Direct per-service URLs (for example `http://127.0.0.1:8789`) still work, but they bypass the gateway.

### Proxy stack env fallbacks (workers-compatible)

`docker-compose.proxy.yml` now follows worker-style host env fallbacks:

- DB host fallback: `DOCKER_DB_HOST` → `host.docker.internal`
- Redis host fallback: `DOCKER_REDIS_HOST` → `host.docker.internal`

This avoids empty override variables falling back to `127.0.0.1` inside containers.

### Health checks, cost, and disable switches

Docker health checks have a small runtime overhead (local CPU/network in Docker host). On most local/dev setups this is negligible, but on metered hosted Docker platforms frequent checks can contribute small additional cost.

You can disable proxy health checks via environment variables:

```bash
PROXY_HEALTHCHECK_DISABLE=true
PROXY_GATEWAY_HEALTHCHECK_DISABLE=true
```

- `PROXY_HEALTHCHECK_DISABLE` disables health checks for proxy services.
- `PROXY_GATEWAY_HEALTHCHECK_DISABLE` disables health checks for the nginx gateway.

Keep them enabled in production unless your platform constraints require disabling them.

## What the `Dockerfile` does

The root `Dockerfile` is multi-stage:

1. **builder** (`node:20-bookworm-slim`)

- installs build tooling (`python3`, `make`, `g++`) for native modules like `bcrypt`
- runs `npm ci`
- runs `npm run build:dk` to produce `dist/`

2. **runtime** (`node:20-bookworm-slim`)

- installs only production dependencies (`npm ci --omit=dev`)
- copies `dist/` from the builder stage
- runs as a non-root user
- starts the compiled server via `node dist/src/boot/bootstrap.js`

## Production build target

To build the runtime stage explicitly:

```bash
npm run docker:build:prod
```

This corresponds to `docker build --target runtime ...`.

## Docker Compose (local dev)

The included `docker-compose.yml` is optimized for local development:

- mounts the repo into the container (`.:/app`) for live iteration
- runs `npm run dev` in the app container
- starts PostgreSQL by default
- includes Redis under the `optional` profile

Start dev services:

```bash
docker-compose up -d
```

Start dev services including Redis:

```bash
docker-compose --profile optional up -d
```

## Environment variables

Compose passes common settings (examples):

- `NODE_ENV`, `HOST`, `PORT`
- `DB_CONNECTION`, `DB_HOST`, `DB_PORT`, `DB_DATABASE`, `DB_USERNAME`, `DB_PASSWORD`

You can override these via your shell environment or a `.env` file that Docker Compose reads.

## Ports and health checks

The Docker setup uses two different conventions:

- Compose maps `3000:3000` by default and sets `PORT=3000`.
- Health checks in both `Dockerfile` and `docker-compose.yml` call `http://localhost:7777/health`.

ZinTrust projects default to port `7777` unless configured otherwise. If your container is configured to listen on `3000`, update the health check URL accordingly (or set your server port to `7777` and map ports as you prefer).

## Persistent data

Compose uses named volumes for infrastructure:

- `postgres_data` for Postgres
- `redis_data` for Redis

Application storage/logs are repo-mounted in dev mode; for production you typically mount only what you need (logs, uploads, backups) and keep your container filesystem immutable.
