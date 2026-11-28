# ZinTrust Docker Images

ZinTrust ships a **single monolith runtime image** used across app runtime, workers, schedules, and proxy services.

The proxy stack also has a companion gateway image.

> **Companion image:** [`zintrust/zintrust-proxy-gateway`](https://hub.docker.com/r/zintrust/zintrust-proxy-gateway) — the Nginx-based gateway that routes and load-balances across all running proxy containers.

---

## What's inside

| Component  | Detail                        |
| ---------- | ----------------------------- |
| Base       | `node:20-alpine`              |
| Entrypoint | `zin` CLI (`dist/bin/zin.js`) |
| Arch       | `linux/amd64`, `linux/arm64`  |

Each proxy type is activated by passing a command to the runtime container:

| Proxy      | Command           | Internal port |
| ---------- | ----------------- | ------------- |
| MySQL      | `proxy:mysql`     | `8789`        |
| PostgreSQL | `proxy:postgres`  | `8790`        |
| Redis      | `proxy:redis`     | `8791`        |
| MongoDB    | `proxy:mongodb`   | `8792`        |
| SQL Server | `proxy:sqlserver` | `8793`        |
| SMTP       | `proxy:smtp`      | `8794`        |

---

## Key features

- **Connection pooling** — each proxy manages a pool toward the real backing service, reducing per-request overhead.
- **Request signing** — HMAC-based signing window prevents unauthenticated traffic from reaching your databases.
- **Health endpoints** — every proxy exposes a `GET /health` endpoint used by Docker health checks and the gateway.
- **Multi-runtime** — works with ZinTrust apps running in Node.js or Cloudflare Workers (via the gateway).
- **Zero build step** — pull and run; no local compile needed.

---

## Quick start

The fastest way to run the full proxy stack is via the `docker/docker-compose.proxy.yml` file included in the [ZinTrust repository](https://github.com/ZinTrust/zintrust).

```bash
# Pull the compose file
curl -O https://raw.githubusercontent.com/ZinTrust/zintrust/master/docker/docker-compose.proxy.yml

# Create a minimal env file
cat > .env.proxy <<'EOF'
APP_KEY=change-me-to-a-long-random-string
DOCKER_DB_HOST=host.docker.internal
DOCKER_REDIS_HOST=host.docker.internal
DB_DATABASE=zintrust
DB_USERNAME=root
DB_PASSWORD=secret
EOF

# Start the stack
docker compose -f docker-compose.proxy.yml --env-file .env.proxy up -d
```

The gateway will be available at **http://localhost:8800**.

---

## Environment variables

### Shared (all proxies)

| Variable   | Default      | Description                           |
| ---------- | ------------ | ------------------------------------- |
| `NODE_ENV` | `production` | Runtime environment (Compose default) |
| `APP_NAME` | `ZinTrust`   | Application name                      |
| `APP_KEY`  | _(required)_ | Secret used for signing               |

### Operational (Docker Compose only)

These are Docker-only tuning knobs used by `docker/docker-compose.proxy.yml`:

| Variable             | Default  | Description                                 |
| -------------------- | -------- | ------------------------------------------- |
| `PROXY_PULL_POLICY`  | `always` | Docker Compose pull policy for proxy images |
| `PROXY_MEM_LIMIT`    | `512m`   | Memory limit per proxy container            |
| `PROXY_CPUS`         | `1.0`    | CPU limit per proxy container               |
| `PROXY_PIDS_LIMIT`   | `512`    | PID limit per proxy container               |
| `PROXY_LOG_MAX_SIZE` | `10m`    | Log rotation max size (`json-file` driver)  |
| `PROXY_LOG_MAX_FILE` | `3`      | Log rotation max files                      |
| `PROXY_GATEWAY_*`    | —        | Gateway overrides: `MEM_LIMIT/CPUS/PIDS`    |

### MySQL proxy

| Variable                 | Default                | Description          |
| ------------------------ | ---------------------- | -------------------- |
| `MYSQL_DB_HOST`          | `host.docker.internal` | Target MySQL host    |
| `MYSQL_DB_PORT`          | `3306`                 | Target MySQL port    |
| `MYSQL_DB_DATABASE`      | `zintrust`             | Database name        |
| `MYSQL_DB_USERNAME`      | `zintrust`             | Database user        |
| `MYSQL_DB_PASSWORD`      | `secret`               | Database password    |
| `MYSQL_PROXY_KEY_ID`     | —                      | Signing key ID       |
| `MYSQL_PROXY_SECRET`     | —                      | Signing secret       |
| `MYSQL_PROXY_POOL_LIMIT` | `100`                  | Max pool connections |

### PostgreSQL proxy

| Variable                    | Default                | Description          |
| --------------------------- | ---------------------- | -------------------- |
| `DB_HOST`                   | `host.docker.internal` | Target Postgres host |
| `DB_PORT_POSTGRESQL`        | `5432`                 | Target Postgres port |
| `DB_DATABASE_POSTGRESQL`    | `postgres`             | Database name        |
| `DB_USERNAME_POSTGRESQL`    | `postgres`             | Database user        |
| `DB_PASSWORD_POSTGRESQL`    | `postgres`             | Database password    |
| `POSTGRES_PROXY_KEY_ID`     | —                      | Signing key ID       |
| `POSTGRES_PROXY_SECRET`     | —                      | Signing secret       |
| `POSTGRES_PROXY_POOL_LIMIT` | `100`                  | Max pool connections |

### Redis proxy

| Variable                      | Default                | Description       |
| ----------------------------- | ---------------------- | ----------------- |
| `REDIS_PROXY_TARGET_HOST`     | `host.docker.internal` | Target Redis host |
| `REDIS_PROXY_TARGET_PORT`     | `6379`                 | Target Redis port |
| `REDIS_PROXY_TARGET_PASSWORD` | —                      | Redis password    |
| `REDIS_PROXY_TARGET_DB`       | `0`                    | Redis DB index    |
| `REDIS_PROXY_KEY_ID`          | —                      | Signing key ID    |
| `REDIS_PROXY_SECRET`          | —                      | Signing secret    |

### SMTP proxy

| Variable            | Default      | Description      |
| ------------------- | ------------ | ---------------- |
| `MAIL_HOST`         | _(required)_ | SMTP server host |
| `MAIL_PORT`         | `587`        | SMTP port        |
| `MAIL_SECURE`       | `false`      | Use TLS          |
| `MAIL_USERNAME`     | _(required)_ | SMTP username    |
| `MAIL_PASSWORD`     | _(required)_ | SMTP password    |
| `SMTP_PROXY_KEY_ID` | —            | Signing key ID   |
| `SMTP_PROXY_SECRET` | —            | Signing secret   |

---

## Image tags

| Tag      | Notes                                       |
| -------- | ------------------------------------------- |
| `latest` | Latest stable release                       |
| `x.y.z`  | Pinned release (recommended for production) |

---

## Publishing (maintainers)

Use the ZinTrust CLI to build and push images to Docker Hub:

```bash
# Push runtime (zintrust/zintrust) + gateway (zintrust/zintrust-proxy-gateway)
zin docker push --tag 1.2.0

# Push only the runtime image
zin docker push --tag 1.2.0 --only runtime

# Push only the gateway image
zin docker push --tag 1.2.0 --only gateway
```

---

## Related

- [zintrust/zintrust-proxy-gateway](https://hub.docker.com/r/zintrust/zintrust-proxy-gateway) — Nginx gateway image
- [ZinTrust on GitHub](https://github.com/ZinTrust/zintrust)
- [Docker Workers](https://zintrust.com/docker-workers)
- [Docker Proxies](https://zintrust.com/docker-proxies)
