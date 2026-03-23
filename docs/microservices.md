# Microservices

ZinTrust includes a microservices runtime and a recommended `zin`-based scaffolding workflow.

This guide combines the practical material that was previously split across multiple pages: service generation, discovery, registration, authentication, tracing, database isolation, and container-oriented workflows.

## Recommended CLI Workflow

The recommended way to start a microservice-oriented project is:

```bash
# Create a microservice-focused project
zin new commerce-platform --template microservice --database postgresql --no-interactive

# Add services inside the project
zin add service users --domain ecommerce --port 3001 --database shared --auth api-key --no-interactive
zin add service orders --domain ecommerce --port 3002 --database shared --auth api-key --no-interactive
zin add service payments --domain ecommerce --port 3003 --database isolated --auth jwt --no-interactive
```

Use this flow when you want services to live inside the main project under `src/services/...`.

## What ZinTrust Supports Today

The current microservices implementation includes:

- Filesystem discovery via `MicroserviceBootstrap`
- In-memory registration and service calls via `MicroserviceManager`
- Optional service-to-service auth via `ServiceAuthMiddleware`
- Optional request tracing via `RequestTracingMiddleware`
- Health helpers such as `HealthCheckHandler` and `ServiceHealthMonitor`
- Project and service scaffolding through the `zin` CLI

## Enable Microservices Mode

Microservices mode is controlled by environment variables:

- `MICROSERVICES=true` enables discovery and bootstrapping
- `ENABLE_MICROSERVICES=true` exists as a legacy/test fallback
- `SERVICES=name1,name2` acts as an allow-list when set

## Service Layout and `service.config.json`

`MicroserviceBootstrap` discovers services under:

`src/services/<domain>/<service>/service.config.json`

Each discovered service is registered with the manager using its `name` and `domain`.

### Example structure

```text
src/services/
  ecommerce/
    users/
      service.config.json
    orders/
      service.config.json
```

### Example config

```json
{
  "name": "users",
  "domain": "ecommerce",
  "version": "1.0.0",
  "port": 3001,
  "description": "Users microservice",
  "dependencies": ["orders"],
  "healthCheck": "/health",
  "database": { "isolation": "shared", "migrations": true },
  "auth": { "strategy": "none" },
  "tracing": { "enabled": false, "samplingRate": 1 }
}
```

Notes:

- `port` is optional; if missing, a port is assigned based on discovery order.
- `healthCheck` defaults to `/health` if not provided.
- `domain` is derived from the directory path and must match your layout.

## Discovery and Registration

Service discovery in ZinTrust is currently a filesystem plus in-memory registry model:

- `MicroserviceBootstrap` scans the service directories
- `MicroserviceManager` holds registered services in memory

Bootstrapping discovery:

```ts
import { MicroserviceBootstrap } from '@zintrust/core';

await MicroserviceBootstrap.getInstance().initialize();
```

What this does:

1. Returns early if microservices are disabled.
2. Discovers services from the configured services directory.
3. Registers them with `MicroserviceManager`.
4. Logs migration-related information when `database.migrations` is enabled.

### Allow-list via `SERVICES`

If `SERVICES` is set as a comma-separated list, the framework treats it as an allow-list:

- Services not listed are skipped during registration.
- If `SERVICES` is empty, all discovered services are eligible.

## Inter-Service Communication

Use `MicroserviceManager.callService()` to call a registered service:

```ts
import { MicroserviceManager } from '@zintrust/core';

const manager = MicroserviceManager.getInstance();

await manager.startService('users');

const response = await manager.callService('users', {
  method: 'GET',
  path: '/health',
  timeout: 5_000,
});
```

Important behavior:

- The manager throws if the service is not registered.
- The manager throws if the service is not in `running` status.
- `callService()` uses `fetch()` and validates the target URL.

## Health Checks

ZinTrust does not automatically add a health route to each service. You must expose one and point `healthCheck` to it.

For convenience, the framework includes `HealthCheckHandler`:

```ts
import { HealthCheckHandler } from '@zintrust/core';

const health = HealthCheckHandler.create('users', '1.0.0', 3001, 'ecommerce');

// Mount health.handle at GET /health
```

For polling multiple services from a monitoring process, use `ServiceHealthMonitor`.

## Service-to-Service Authentication

`ServiceAuthMiddleware` supports:

- `api-key`
- `jwt`
- `none`
- `custom`

Production guidance:

- Configure `SERVICE_API_KEY` or `SERVICE_JWT_SECRET`.
- Add the middleware to the service request pipeline.

## Request Tracing

`RequestTracingMiddleware` can:

- Attach and log `x-trace-id` and related headers on incoming requests
- Provide an `injectHeaders()` helper for outgoing calls

Propagation is not automatic in `callService()`; pass the headers explicitly.

## Database Isolation Strategies

### Shared database

Use a single database with service-specific schemas:

```json
{
  "database": {
    "isolation": "shared",
    "migrations": true
  }
}
```

Benefits:

- Lower infrastructure cost
- Easier operational management
- Optional cross-service joins when needed

### Isolated database

Give each service its own database:

```json
{
  "database": {
    "isolation": "isolated",
    "migrations": true
  }
}
```

Benefits:

- Stronger service boundaries
- Independent scaling and migration strategy
- Cleaner ownership per service

## Environment Configuration

```bash
MICROSERVICES=true
SERVICES=users,orders,payments
MICROSERVICES_TRACING=true
MICROSERVICES_TRACING_RATE=0.5
DATABASE_ISOLATION=shared
```

For the full config surface, see [config-microservices.md](./config-microservices.md).

## Container and Deployment Notes

For microservice projects generated with `zin`, you can containerize each service using the standard Docker workflow used elsewhere in ZinTrust:

- add service-level Dockerfiles where needed
- run `docker-compose` or your deployment platform of choice
- keep service config and environment variables aligned with each service boundary

The main recommended developer workflow remains the `zin` CLI for project and service scaffolding.
