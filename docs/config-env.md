# Env configuration

Source: src/config/env.ts

This document lists all supported environment variables, their defaults, and what they control.

## Usage

```ts
import { Env } from '@zintrust/core';

// Example
// Env.NODE_ENV
```

## Core application

| Key                 | Default       | Description                                                         |
| ------------------- | ------------- | ------------------------------------------------------------------- |
| `NODE_ENV`          | `development` | Runtime mode: development, staging, production.                     |
| `APP_MODE`          | `NODE_ENV`    | App mode override (defaults to `NODE_ENV`).                         |
| `APP_PORT`          | `3000`        | Alternate port; `PORT` wins when set.                               |
| `PORT`              | `3000`        | HTTP server port.                                                   |
| `HOST`              | `localhost`   | Bind address for server listeners.                                  |
| `BASE_URL`          | empty         | Base origin used to build fully-qualified URLs.                     |
| `APP_NAME`          | `ZinTrust`    | Application name (also used for proxy signing fallback).            |
| `APP_KEY`           | empty         | Primary app secret (base64 or raw) used for encryption and signing. |
| `APP_PREVIOUS_KEYS` | empty         | Optional rotation keys (comma-separated or JSON array).             |
| `APP_TIMEZONE`      | `UTC`         | Default timezone for the app runtime.                               |
| `RUNTIME`           | empty         | Optional runtime identifier.                                        |

## Database (generic)

| Key             | Default     | Description                                                |
| --------------- | ----------- | ---------------------------------------------------------- |
| `DB_CONNECTION` | `sqlite`    | Database driver: sqlite, postgresql, mysql, sqlserver, d1. |
| `DB_HOST`       | `localhost` | Default database host.                                     |
| `DB_PORT`       | `5432`      | Default database port.                                     |
| `DB_DATABASE`   | `zintrust`  | Default database name.                                     |
| `DB_USERNAME`   | `postgres`  | Default database user.                                     |
| `DB_PASSWORD`   | empty       | Default database password.                                 |
| `DB_READ_HOSTS` | empty       | Optional read replica hosts (comma-separated).             |

## PostgreSQL-specific

| Key                        | Default    | Description                    |
| -------------------------- | ---------- | ------------------------------ |
| `DB_PORT_POSTGRESQL`       | `5432`     | PostgreSQL port.               |
| `DB_DATABASE_POSTGRESQL`   | `postgres` | PostgreSQL database name.      |
| `DB_USERNAME_POSTGRESQL`   | `postgres` | PostgreSQL user.               |
| `DB_PASSWORD_POSTGRESQL`   | empty      | PostgreSQL password.           |
| `DB_READ_HOSTS_POSTGRESQL` | empty      | PostgreSQL read replica hosts. |

## SQL Server (MSSQL)

| Key                   | Default    | Description                    |
| --------------------- | ---------- | ------------------------------ |
| `DB_HOST_MSSQL`       | `DB_HOST`  | SQL Server host override.      |
| `DB_PORT_MSSQL`       | `1433`     | SQL Server port.               |
| `DB_DATABASE_MSSQL`   | `zintrust` | SQL Server database name.      |
| `DB_USERNAME_MSSQL`   | `sa`       | SQL Server user.               |
| `DB_PASSWORD_MSSQL`   | empty      | SQL Server password.           |
| `DB_READ_HOSTS_MSSQL` | empty      | SQL Server read replica hosts. |

## Cloudflare & remote services

| Key                          | Default    | Description                           |
| ---------------------------- | ---------- | ------------------------------------- |
| `D1_DATABASE_ID`             | empty      | D1 database binding ID.               |
| `KV_NAMESPACE_ID`            | empty      | KV namespace binding ID.              |
| `D1_REMOTE_URL`              | empty      | Remote D1 proxy URL.                  |
| `D1_REMOTE_KEY_ID`           | empty      | Remote D1 key id for request signing. |
| `D1_REMOTE_SECRET`           | empty      | Remote D1 secret for request signing. |
| `D1_REMOTE_MODE`             | `registry` | Remote D1 mode: registry or proxy.    |
| `KV_REMOTE_URL`              | empty      | Remote KV proxy URL.                  |
| `KV_REMOTE_KEY_ID`           | empty      | Remote KV key id.                     |
| `KV_REMOTE_SECRET`           | empty      | Remote KV secret.                     |
| `KV_REMOTE_NAMESPACE`        | empty      | Remote KV namespace.                  |
| `CLOUDFLARE_ACCOUNT_ID`      | empty      | Cloudflare account id.                |
| `CLOUDFLARE_API_TOKEN`       | empty      | Cloudflare API token.                 |
| `CLOUDFLARE_KV_NAMESPACE_ID` | empty      | Optional Cloudflare KV namespace id.  |

## Proxy client defaults

| Key                          | Default | Description                                    |
| ---------------------------- | ------- | ---------------------------------------------- |
| `ZT_PROXY_TIMEOUT_MS`        | `30000` | Default proxy request timeout in milliseconds. |
| `ZT_PROXY_SIGNING_WINDOW_MS` | `60000` | Default signing window in milliseconds.        |

## MySQL proxy (HTTP)

| Key                             | Default                      | Description                                         |
| ------------------------------- | ---------------------------- | --------------------------------------------------- |
| `MYSQL_PROXY_URL`               | empty                        | Full proxy URL (overrides host/port).               |
| `MYSQL_PROXY_HOST`              | `127.0.0.1`                  | Proxy host.                                         |
| `MYSQL_PROXY_PORT`              | `8789`                       | Proxy port.                                         |
| `MYSQL_PROXY_MAX_BODY_BYTES`    | `131072`                     | Max request body size in bytes.                     |
| `MYSQL_PROXY_POOL_LIMIT`        | `10`                         | Max connection pool size.                           |
| `MYSQL_PROXY_KEY_ID`            | empty                        | Signing key id (defaults to `APP_NAME` when empty). |
| `MYSQL_PROXY_SECRET`            | empty                        | Signing secret (defaults to `APP_KEY` when empty).  |
| `MYSQL_PROXY_TIMEOUT_MS`        | `ZT_PROXY_TIMEOUT_MS`        | Request timeout in milliseconds.                    |
| `MYSQL_PROXY_REQUIRE_SIGNING`   | `true`                       | Require request signing.                            |
| `MYSQL_PROXY_SIGNING_WINDOW_MS` | `ZT_PROXY_SIGNING_WINDOW_MS` | Allowed clock skew window.                          |

## Postgres proxy (HTTP)

| Key                                | Default                      | Description                                         |
| ---------------------------------- | ---------------------------- | --------------------------------------------------- |
| `POSTGRES_PROXY_URL`               | empty                        | Full proxy URL (overrides host/port).               |
| `POSTGRES_PROXY_HOST`              | `127.0.0.1`                  | Proxy host.                                         |
| `POSTGRES_PROXY_PORT`              | `8790`                       | Proxy port.                                         |
| `POSTGRES_PROXY_MAX_BODY_BYTES`    | `131072`                     | Max request body size in bytes.                     |
| `POSTGRES_PROXY_POOL_LIMIT`        | `10`                         | Max connection pool size.                           |
| `POSTGRES_PROXY_KEY_ID`            | empty                        | Signing key id (defaults to `APP_NAME` when empty). |
| `POSTGRES_PROXY_SECRET`            | empty                        | Signing secret (defaults to `APP_KEY` when empty).  |
| `POSTGRES_PROXY_TIMEOUT_MS`        | `ZT_PROXY_TIMEOUT_MS`        | Request timeout in milliseconds.                    |
| `POSTGRES_PROXY_REQUIRE_SIGNING`   | `true`                       | Require request signing.                            |
| `POSTGRES_PROXY_SIGNING_WINDOW_MS` | `ZT_PROXY_SIGNING_WINDOW_MS` | Allowed clock skew window.                          |

## Redis proxy (HTTP)

| Key                             | Default                      | Description                                         |
| ------------------------------- | ---------------------------- | --------------------------------------------------- |
| `REDIS_PROXY_URL`               | empty                        | Full proxy URL (overrides host/port).               |
| `REDIS_PROXY_HOST`              | `127.0.0.1`                  | Proxy host.                                         |
| `REDIS_PROXY_PORT`              | `8791`                       | Proxy port.                                         |
| `REDIS_PROXY_MAX_BODY_BYTES`    | `131072`                     | Max request body size in bytes.                     |
| `REDIS_PROXY_KEY_ID`            | empty                        | Signing key id (defaults to `APP_NAME` when empty). |
| `REDIS_PROXY_SECRET`            | empty                        | Signing secret (defaults to `APP_KEY` when empty).  |
| `REDIS_PROXY_TIMEOUT_MS`        | `ZT_PROXY_TIMEOUT_MS`        | Request timeout in milliseconds.                    |
| `REDIS_PROXY_REQUIRE_SIGNING`   | `true`                       | Require request signing.                            |
| `REDIS_PROXY_SIGNING_WINDOW_MS` | `ZT_PROXY_SIGNING_WINDOW_MS` | Allowed clock skew window.                          |
| `USE_REDIS_PROXY`               | `false`                      | Enable Redis proxy.                                 |

## MongoDB proxy (HTTP)

| Key                               | Default                      | Description                                         |
| --------------------------------- | ---------------------------- | --------------------------------------------------- |
| `MONGODB_PROXY_URL`               | empty                        | Full proxy URL (overrides host/port).               |
| `MONGODB_PROXY_HOST`              | `127.0.0.1`                  | Proxy host.                                         |
| `MONGODB_PROXY_PORT`              | `8792`                       | Proxy port.                                         |
| `MONGODB_PROXY_MAX_BODY_BYTES`    | `131072`                     | Max request body size in bytes.                     |
| `MONGODB_PROXY_KEY_ID`            | empty                        | Signing key id (defaults to `APP_NAME` when empty). |
| `MONGODB_PROXY_SECRET`            | empty                        | Signing secret (defaults to `APP_KEY` when empty).  |
| `MONGODB_PROXY_TIMEOUT_MS`        | `ZT_PROXY_TIMEOUT_MS`        | Request timeout in milliseconds.                    |
| `MONGODB_PROXY_REQUIRE_SIGNING`   | `true`                       | Require request signing.                            |
| `MONGODB_PROXY_SIGNING_WINDOW_MS` | `ZT_PROXY_SIGNING_WINDOW_MS` | Allowed clock skew window.                          |
| `USE_MONGODB_PROXY`               | `false`                      | Enable MongoDB proxy.                               |

## SQL Server proxy (HTTP)

| Key                                 | Default                      | Description                                         |
| ----------------------------------- | ---------------------------- | --------------------------------------------------- |
| `SQLSERVER_PROXY_URL`               | empty                        | Full proxy URL (overrides host/port).               |
| `SQLSERVER_PROXY_HOST`              | `127.0.0.1`                  | Proxy host.                                         |
| `SQLSERVER_PROXY_PORT`              | `8793`                       | Proxy port.                                         |
| `SQLSERVER_PROXY_MAX_BODY_BYTES`    | `131072`                     | Max request body size in bytes.                     |
| `SQLSERVER_PROXY_POOL_LIMIT`        | `10`                         | Max connection pool size.                           |
| `SQLSERVER_PROXY_KEY_ID`            | empty                        | Signing key id (defaults to `APP_NAME` when empty). |
| `SQLSERVER_PROXY_SECRET`            | empty                        | Signing secret (defaults to `APP_KEY` when empty).  |
| `SQLSERVER_PROXY_TIMEOUT_MS`        | `ZT_PROXY_TIMEOUT_MS`        | Request timeout in milliseconds.                    |
| `SQLSERVER_PROXY_REQUIRE_SIGNING`   | `true`                       | Require request signing.                            |
| `SQLSERVER_PROXY_SIGNING_WINDOW_MS` | `ZT_PROXY_SIGNING_WINDOW_MS` | Allowed clock skew window.                          |
| `USE_SQLSERVER_PROXY`               | `false`                      | Enable SQL Server proxy.                            |

## Cache

| Key              | Default          | Description                               |
| ---------------- | ---------------- | ----------------------------------------- |
| `CACHE_DRIVER`   | `memory`         | Cache driver: memory, redis, mongodb, kv. |
| `REDIS_HOST`     | `localhost`      | Redis host.                               |
| `REDIS_PORT`     | `6379`           | Redis port.                               |
| `REDIS_PASSWORD` | empty            | Redis password.                           |
| `REDIS_DB`       | `0`              | Redis database index.                     |
| `REDIS_URL`      | empty            | Optional full Redis URL.                  |
| `MONGO_URI`      | empty            | MongoDB Data API endpoint (cache).        |
| `MONGO_DB`       | `zintrust_cache` | MongoDB cache database name.              |

## Queue

| Key                | Default | Description            |
| ------------------ | ------- | ---------------------- |
| `QUEUE_CONNECTION` | empty   | Queue connection name. |
| `QUEUE_DRIVER`     | empty   | Queue driver.          |

## Rate limiting

| Key                     | Default               | Description                       |
| ----------------------- | --------------------- | --------------------------------- |
| `RATE_LIMIT_STORE`      | empty                 | Store type for rate limiting.     |
| `RATE_LIMIT_DRIVER`     | empty                 | Rate limit driver implementation. |
| `RATE_LIMIT_KEY_PREFIX` | `zintrust:ratelimit:` | Key prefix used by rate limiter.  |

## Notifications

| Key                   | Default    | Description          |
| --------------------- | ---------- | -------------------- |
| `NOTIFICATION_DRIVER` | empty      | Notification driver. |
| `TERMII_API_KEY`      | empty      | Termii API key.      |
| `TERMII_SENDER`       | `ZinTrust` | Termii sender name.  |

## AWS

| Key                           | Default     | Description                   |
| ----------------------------- | ----------- | ----------------------------- |
| `AWS_REGION`                  | `us-east-1` | AWS region.                   |
| `AWS_DEFAULT_REGION`          | empty       | AWS default region override.  |
| `AWS_ACCESS_KEY_ID`           | empty       | AWS access key.               |
| `AWS_SECRET_ACCESS_KEY`       | empty       | AWS secret key.               |
| `AWS_SESSION_TOKEN`           | empty       | AWS session token.            |
| `AWS_LAMBDA_FUNCTION_NAME`    | empty       | Lambda function name.         |
| `AWS_LAMBDA_FUNCTION_VERSION` | empty       | Lambda function version.      |
| `AWS_EXECUTION_ENV`           | empty       | Lambda execution environment. |
| `LAMBDA_TASK_ROOT`            | empty       | Lambda task root path.        |

## Microservices

| Key                          | Default  | Description                             |
| ---------------------------- | -------- | --------------------------------------- |
| `MICROSERVICES`              | empty    | Comma-separated list of microservices.  |
| `SERVICES`                   | empty    | Service names to load.                  |
| `MICROSERVICES_TRACING`      | `false`  | Enable distributed tracing.             |
| `MICROSERVICES_TRACING_RATE` | `1.0`    | Trace sampling rate.                    |
| `DATABASE_ISOLATION`         | `shared` | Database isolation mode.                |
| `SERVICE_API_KEY`            | empty    | Service API key for inter-service auth. |
| `SERVICE_JWT_SECRET`         | empty    | Service JWT secret.                     |

## Security

| Key                    | Default   | Description                                                      |
| ---------------------- | --------- | ---------------------------------------------------------------- |
| `DEBUG`                | `false`   | Enable debug mode.                                               |
| `ENABLE_MICROSERVICES` | `false`   | Global microservices feature flag.                               |
| `TOKEN_TTL`            | `3600000` | Access token TTL in milliseconds.                                |
| `TOKEN_LENGTH`         | `32`      | Token length (random bytes/characters).                          |
| `CSRF_STORE`           | empty     | CSRF store (e.g., redis).                                        |
| `CSRF_DRIVER`          | empty     | CSRF driver implementation.                                      |
| `CSRF_REDIS_DB`        | `1`       | Redis DB index for CSRF store.                                   |
| `ENCRYPTION_CIPHER`    | empty     | Cipher used by `EncryptedEnvelope` (aes-256-cbc or aes-256-gcm). |

## Deployment

| Key                | Default       | Description                     |
| ------------------ | ------------- | ------------------------------- |
| `ENVIRONMENT`      | `development` | Deployment environment label.   |
| `REQUEST_TIMEOUT`  | `30000`       | Global request timeout (ms).    |
| `MAX_BODY_SIZE`    | `10485760`    | Max request body size in bytes. |
| `SHUTDOWN_TIMEOUT` | `10000`       | Graceful shutdown timeout (ms). |

## SSE

| Key                      | Default | Description                   |
| ------------------------ | ------- | ----------------------------- |
| `SSE_HEARTBEAT_INTERVAL` | `15000` | SSE heartbeat interval in ms. |
| `SSE_SNAPSHOT_INTERVAL`  | `5000`  | SSE snapshot interval in ms.  |

## Logging

| Key                 | Default                | Description                                |
| ------------------- | ---------------------- | ------------------------------------------ |
| `LOG_LEVEL`         | `debug`/`info`/`error` | Log level (depends on `NODE_ENV`).         |
| `LOG_FORMAT`        | `text`                 | Log format (text or json).                 |
| `LOG_CHANNEL`       | empty                  | Log channel override (console/file/cloud). |
| `DISABLE_LOGGING`   | `false`                | Disable logging entirely.                  |
| `LOG_HTTP_REQUEST`  | `false`                | Enable request logging middleware.         |
| `LOG_TO_FILE`       | `false`                | Enable file logging output.                |
| `LOG_ROTATION_SIZE` | `10485760`             | Max log file size in bytes.                |
| `LOG_ROTATION_DAYS` | `7`                    | Days to keep rotated logs.                 |

## ZinTrust tooling

| Key                           | Default                 | Description                            |
| ----------------------------- | ----------------------- | -------------------------------------- |
| `ZINTRUST_PROJECT_ROOT`       | empty                   | Project root override.                 |
| `ZINTRUST_ALLOW_POSTINSTALL`  | empty                   | Allow postinstall scripts (CLI).       |
| `ZINTRUST_ENV_FILE`           | `.env.pull`             | Pull env file name.                    |
| `ZINTRUST_SECRETS_MANIFEST`   | `secrets.manifest.json` | Secrets manifest file.                 |
| `ZINTRUST_ENV_IN_FILE`        | `.env`                  | Env input file name.                   |
| `ZINTRUST_SECRETS_PROVIDER`   | empty                   | Secrets provider (vault, cloud, etc.). |
| `ZINTRUST_ALLOW_AUTO_INSTALL` | empty                   | Allow auto-install of dependencies.    |

## CI / system

| Key           | Default | Description                       |
| ------------- | ------- | --------------------------------- |
| `CI`          | empty   | CI indicator.                     |
| `HOME`        | empty   | User home directory (system).     |
| `USERPROFILE` | empty   | User profile directory (Windows). |

## Templates

| Key                  | Default                                           | Description                          |
| -------------------- | ------------------------------------------------- | ------------------------------------ |
| `TEMPLATE_COPYRIGHT` | `© 2025 ZinTrust Framework. All rights reserved.` | Template copyright text.             |
| `SERVICE_NAME`       | empty                                             | Service name override for templates. |

## Computed values (read-only)

These are derived at runtime and do not need to be set:

| Key            | Description                                                     |
| -------------- | --------------------------------------------------------------- |
| `NODE_BIN_DIR` | Derived from the runtime `execPath`.                            |
| `SAFE_PATH`    | Safe PATH constructed from system defaults and runtime bin dir. |
