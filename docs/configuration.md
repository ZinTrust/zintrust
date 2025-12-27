# Configuration

Zintrust configuration is driven primarily by environment variables and exposed through the sealed `Env` namespace (`src/config/env.ts`) and the config modules in `src/config/*`.

## Overview

- **Source of truth:** `process.env` (or the equivalent in your runtime).
- **Type-safe access:** `Env.get()`, `Env.getInt()`, `Env.getBool()`.
- **Defaults:** Many values have defaults; some are validated at startup.

## Loading `.env` Files (Node.js)

Zintrust includes a small `.env` loader for the CLI and Node tooling (`src/cli/utils/EnvFileLoader.ts`).

Load order (when present):

1. `.env`
2. `.env.<mode>` (only when `APP_MODE` is set and not `production`; e.g. `.env.dev`)
3. `.env.local`
4. `.env.<mode>.local`

Notes:

- If `APP_PORT` is set but `PORT` is not, the loader sets `PORT=APP_PORT`.
- If `APP_MODE` is set but `NODE_ENV` is not, the loader derives `NODE_ENV`.

If you run the framework via the CLI, this is handled for you. If you run your own Node entrypoint, you can call `EnvFileLoader.ensureLoaded()` early.

## Startup Configuration Validation

During `Application.boot()`, Zintrust validates a small set of critical startup configuration using `StartupConfigValidator` (`src/config/StartupConfigValidator.ts`).

Currently validated:

- `NODE_ENV`: one of `development`, `production`, `testing`, `test`
- `APP_PORT`: integer in `[1, 65535]`
- `LOG_FORMAT`: one of `text`, `json`
- `LOG_LEVEL`: one of `debug`, `info`, `warn`, `error`
- `LOG_ROTATION_SIZE`: positive integer
- `LOG_ROTATION_DAYS`: positive integer
- In `production`: `APP_KEY` must be set and at least 16 characters

If validation fails, boot throws a structured `ConfigError`.

## Core Application

| Variable          | Type       | Default             | Notes                                                             |
| ----------------- | ---------- | ------------------- | ----------------------------------------------------------------- |
| `NODE_ENV`        | string     | `development`       | Common values: `development`, `production`, `testing`             |
| `APP_NAME`        | string     | `ZinTrust`          | Used in responses and logs                                        |
| `APP_KEY`         | string     | `""`                | Required in production (>= 16 chars)                              |
| `APP_PORT`        | int        | `3000`              | Exposed as `Env.PORT`                                             |
| `PORT`            | int        | `3000`              | Used by `src/boot/bootstrap.ts`; keep in sync with `APP_PORT`     |
| `HOST`            | string     | `localhost`         | Bind host                                                         |
| `DEBUG`           | bool       | `false`             | Debug behavior in some modules                                    |
| `APP_TIMEZONE`    | string     | `UTC`               | Used by `src/config/app.ts`                                       |
| `REQUEST_TIMEOUT` | int        | `30000`             | Milliseconds                                                      |
| `MAX_BODY_SIZE`   | int/string | `10485760` / `10mb` | `Env.MAX_BODY_SIZE` is bytes; `appConfig.maxBodySize` is a string |

## Logging

| Variable                       | Type   | Default                  | Notes                                                                   |
| ------------------------------ | ------ | ------------------------ | ----------------------------------------------------------------------- |
| `LOG_LEVEL`                    | string | depends on `NODE_ENV`    | prod defaults to `info`, testing defaults to `error`, otherwise `debug` |
| `LOG_FORMAT`                   | string | `text`                   | `text` or `json`                                                        |
| `DISABLE_LOGGING`              | bool   | `false`                  | Disables log output                                                     |
| `LOG_HTTP_REQUEST`             | bool   | `false`                  | Enables HTTP request logging middleware                                 |
| `LOG_TO_FILE`                  | bool   | `false`                  | Enables Node-only file logging                                          |
| `LOG_ROTATION_SIZE`            | int    | `10485760`               | Max bytes before rotating (Node-only)                                   |
| `LOG_ROTATION_DAYS`            | int    | `7`                      | Retention window in days (Node-only)                                    |
| `LOG_CLEANUP_ENABLED`          | bool   | depends on `LOG_TO_FILE` | Enables scheduled cleanup; defaults to `true` when `LOG_TO_FILE=true`   |
| `LOG_CLEANUP_INTERVAL_MS`      | int    | `3600000`                | Cleanup schedule interval in ms (Node/Fargate only)                     |
| `LOG_MAX_TOTAL_SIZE`           | int    | unset                    | Optional max total bytes for `logs/` before deleting old files          |
| `LOG_KEEP_FILES`               | int    | `0`                      | Minimum number of recent log files to keep                              |
| `SCHEDULE_SHUTDOWN_TIMEOUT_MS` | int    | `30000`                  | Max time to wait for schedules to stop during shutdown                  |

## Database

Core DB variables (from `Env`):

| Variable        | Type   | Default     |
| --------------- | ------ | ----------- |
| `DB_CONNECTION` | string | `sqlite`    |
| `DB_HOST`       | string | `localhost` |
| `DB_PORT`       | int    | `5432`      |
| `DB_DATABASE`   | string | `zintrust`  |
| `DB_USERNAME`   | string | `postgres`  |
| `DB_PASSWORD`   | string | `""`        |
| `DB_READ_HOSTS` | string | `""`        |

Additional database tuning (from `src/config/database.ts`):

- `DB_SSL` (bool, default `false`)
- `DB_POOLING` (bool, default `true`)
- `DB_POOL_MIN` (int, default `5`)
- `DB_POOL_MAX` (int, default `20`)
- `DB_IDLE_TIMEOUT` (int ms, default `30000`)
- `DB_CONNECTION_TIMEOUT` (int ms, default `10000`)
- `DB_LOG_LEVEL` (string, default `debug`)
- `DB_MIGRATION_EXT` (string, default `.ts`)

## Cache

| Variable            | Type   | Default     | Notes                                        |
| ------------------- | ------ | ----------- | -------------------------------------------- |
| `CACHE_DRIVER`      | string | `memory`    | `memory`, `redis`, `memcached`, `file`, etc. |
| `CACHE_DEFAULT_TTL` | int    | `3600`      | Seconds                                      |
| `CACHE_KEY_PREFIX`  | string | `zintrust:` | Prefix for namespacing                       |

Driver-specific keys (from `src/config/cache.ts`):

- Memory: `CACHE_MEMORY_TTL` (seconds)
- Redis: `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, `REDIS_DB`, `CACHE_REDIS_TTL`
- Memcached: `MEMCACHED_SERVERS`, `CACHE_MEMCACHED_TTL`
- File: `CACHE_FILE_PATH`, `CACHE_FILE_TTL`
- Mongo: `MONGO_URI`, `MONGO_DB`

## Queue

From `src/config/queue.ts`:

- `QUEUE_DRIVER` (default `sync`)
- `QUEUE_TABLE` (default `jobs`)
- `QUEUE_DB_CONNECTION` (default `default`)

Redis:

- `REDIS_QUEUE_DB` (default `1`)

RabbitMQ:

- `RABBITMQ_HOST` (default `localhost`)
- `RABBITMQ_PORT` (default `5672`)
- `RABBITMQ_USER` (default `guest`)
- `RABBITMQ_PASSWORD` (default `guest`)
- `RABBITMQ_VHOST` (default `/`)

AWS SQS:

- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_SQS_QUEUE_URL`

Failed jobs:

- `FAILED_JOBS_DB_CONNECTION` (default `default`)
- `FAILED_JOBS_TABLE` (default `failed_jobs`)

Worker controls:

- `QUEUE_JOB_TIMEOUT` (default `60`)
- `QUEUE_JOB_RETRIES` (default `3`)
- `QUEUE_JOB_BACKOFF` (default `0`)
- `QUEUE_WORKERS` (default `1`)

## Microservices

From `Env` and `src/config/microservices.ts`:

- `MICROSERVICES` (bool-ish; enables microservices mode)
- `ENABLE_MICROSERVICES` (bool; used by some components)
- `SERVICES` (comma-separated service list)

Service discovery:

- `SERVICE_DISCOVERY_TYPE` (default `filesystem`; `filesystem`, `consul`, `etcd`)
- `SERVICES_PATH` (default `services`)
- `SERVICE_DISCOVERY_REFRESH_INTERVAL` (default `30000`)

Registry:

- `SERVICE_REGISTRY_HOST` (default `localhost`)
- `SERVICE_REGISTRY_PORT` (default `8500`)
- `SERVICE_DEREGISTER_CRITICAL_AFTER` (default `30s`)

Service auth:

- `SERVICE_AUTH_STRATEGY` (default `none`; `api-key`, `jwt`, `none`, `custom`)
- `SERVICE_API_KEY`
- `SERVICE_JWT_SECRET`

Tracing:

- `MICROSERVICES_TRACING` (default `false`)
- `MICROSERVICES_TRACING_RATE` (default `1.0`)
- `TRACING_EXPORT_INTERVAL` (default `10000`)
- `JAEGER_AGENT_HOST` (default `localhost`)

Isolation:

- `DATABASE_ISOLATION` (default `shared`; `shared` or `isolated`)
- `DATABASE_SCHEMA_PREFIX` (default `microservice`)

Health checks:

- `SERVICE_HEALTH_CHECK_ENABLED` (default `true`)
- `SERVICE_HEALTH_CHECK_INTERVAL` (default `30000`)
- `SERVICE_HEALTH_CHECK_TIMEOUT` (default `5000`)
- `SERVICE_UNHEALTHY_THRESHOLD` (default `3`)
- `SERVICE_HEALTHY_THRESHOLD` (default `2`)

Service calls:

- `SERVICE_CALL_TIMEOUT` (default `30000`)
- `SERVICE_CALL_RETRIES` (default `3`)
- `SERVICE_CALL_RETRY_DELAY` (default `1000`)

Circuit breaker:

- `CIRCUIT_BREAKER_ENABLED` (default `true`)
- `CIRCUIT_BREAKER_THRESHOLD` (default `5`)
- `CIRCUIT_BREAKER_TIMEOUT` (default `60000`)

Service mesh:

- `SERVICE_MESH_ENABLED` (default `false`)
- `SERVICE_MESH_TYPE` (default `istio`; `istio` or `linkerd`)
- `SERVICE_MESH_NAMESPACE` (default `default`)

## Security

From `src/config/security.ts`:

JWT:

- `JWT_ENABLED` (default `true`)
- `JWT_SECRET`
- `JWT_ALGORITHM` (default `HS256`)
- `JWT_EXPIRES_IN` (default `1h`)
- `JWT_REFRESH_EXPIRES_IN` (default `7d`)
- `JWT_ISSUER` (default `zintrust`)
- `JWT_AUDIENCE` (default `zintrust-api`)

CSRF:

- `CSRF_ENABLED` (default `true`)
- `CSRF_HEADER_NAME` (default `x-csrf-token`)
- `CSRF_TOKEN_NAME` (default `_csrf`)
- `CSRF_COOKIE_NAME` (default `XSRF-TOKEN`)
- `CSRF_COOKIE_HTTP_ONLY` (default `true`)
- `CSRF_COOKIE_SECURE` (default `true`)
- `CSRF_COOKIE_SAME_SITE` (default `strict`; `strict`, `lax`, `none`)

API key:

- `API_KEY_ENABLED` (default `true`)
- `API_KEY_HEADER` (default `x-api-key`)
- `API_KEY_SECRET`

CORS:

- `CORS_ENABLED` (default `true`)
- `CORS_ORIGINS` (default `*`)
- `CORS_METHODS` (default `GET,POST,PUT,PATCH,DELETE`)
- `CORS_ALLOWED_HEADERS` (default `Content-Type,Authorization`)
- `CORS_EXPOSED_HEADERS` (default empty)
- `CORS_CREDENTIALS` (default `false`)
- `CORS_MAX_AGE` (default `86400`)

Rate limiting:

- `RATE_LIMIT_ENABLED` (default `true`)
- `RATE_LIMIT_WINDOW_MS` (default `900000`)
- `RATE_LIMIT_MAX_REQUESTS` (default `100`)
- `RATE_LIMIT_MESSAGE` (default `Too many requests, please try again later`)

XSS / headers:

- `XSS_ENABLED` (default `true`)
- `XSS_REPORT_URI`
- `HELMET_ENABLED` (default `true`)
- `CSP_ENABLED` (default `true`)
- `HSTS_ENABLED` (default `true`)
- `HSTS_MAX_AGE` (default `31536000`)
- `HSTS_INCLUDE_SUBDOMAINS` (default `true`)

Session:

- `SESSION_NAME` (default `zintrust_session`)
- `SESSION_SECRET` (default `your-session-secret`)
- `SESSION_EXPIRES_IN` (default `1800000`)
- `SESSION_SECURE` (default `true`)
- `SESSION_HTTP_ONLY` (default `true`)
- `SESSION_SAME_SITE` (default `strict`)

Password policy:

- `PASSWORD_MIN_LENGTH` (default `8`)
- `PASSWORD_REQUIRE_UPPERCASE` (default `true`)
- `PASSWORD_REQUIRE_NUMBERS` (default `true`)
- `PASSWORD_REQUIRE_SPECIAL_CHARS` (default `true`)
- `BCRYPT_ROUNDS` (default `10`)

## Storage

From `src/config/storage.ts`:

- `STORAGE_DRIVER` (default `local`)

Local:

- `STORAGE_PATH` (default `storage`)
- `STORAGE_URL` (default `/storage`)
- `STORAGE_VISIBILITY` (default `private`)

AWS S3:

- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_S3_BUCKET`
- `AWS_S3_URL`
- `AWS_S3_ENDPOINT`
- `AWS_S3_USE_PATH_STYLE_URL` (default `false`)

GCS:

- `GCS_PROJECT_ID`
- `GCS_KEY_FILE`
- `GCS_BUCKET`
- `GCS_URL`

Temp files / uploads / backups:

- `TEMP_PATH` (default `storage/temp`)
- `TEMP_FILE_MAX_AGE` (default `86400`)
- `MAX_UPLOAD_SIZE` (default `100mb`)
- `ALLOWED_UPLOAD_MIMES` (default `jpg,jpeg,png,pdf,doc,docx`)
- `UPLOADS_PATH` (default `storage/uploads`)
- `BACKUPS_PATH` (default `storage/backups`)
- `BACKUP_DRIVER` (default `s3`)

## Cloudflare

Zintrust’s Cloudflare support is configured primarily via your Workers bindings (Wrangler `binding` names) plus a small set of runtime env flags.

Runtime flags:

- `DB_CONNECTION=d1` (use the D1 adapter)
- `CACHE_DRIVER=kv` (use the KV cache driver)

Workers binding names (expected defaults):

- D1 binding name: `DB`
- KV binding name: `CACHE`

Legacy/optional env keys:

- `D1_DATABASE_ID`
- `KV_NAMESPACE_ID`

These are not required for runtime access in Workers; Zintrust resolves D1/KV via bindings.

See `docs/cloudflare.md` for the full setup.

## AWS (Runtime)

From `Env`:

- `AWS_REGION` (default `us-east-1`)
- `AWS_LAMBDA_FUNCTION_NAME`
- `AWS_LAMBDA_FUNCTION_VERSION`
- `AWS_EXECUTION_ENV`
- `LAMBDA_TASK_ROOT`

## Runtime Selection

Some runtime adapters can be selected explicitly:

- `RUNTIME` (used by runtime detection logic)

## Examples

### Development

```env
NODE_ENV=development
APP_NAME=ZinTrust
APP_PORT=3000
HOST=localhost

LOG_LEVEL=debug
LOG_FORMAT=text
LOG_HTTP_REQUEST=true
```

### Production

```env
NODE_ENV=production
APP_NAME=ZinTrust
APP_PORT=3000
HOST=0.0.0.0

# Required in production
APP_KEY=your-very-long-secret-key-here

LOG_LEVEL=info
LOG_FORMAT=json
LOG_TO_FILE=true
LOG_ROTATION_SIZE=10485760
LOG_ROTATION_DAYS=7
```

### Testing

```env
NODE_ENV=testing
LOG_LEVEL=error
LOG_FORMAT=text
LOG_TO_FILE=false
```
