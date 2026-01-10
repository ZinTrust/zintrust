# Microservices

ZinTrust includes a microservices runtime that supports:

- Service discovery from the filesystem (`MicroserviceBootstrap`)
- Service registration and calls (`MicroserviceManager`)
- Optional service-to-service auth (`ServiceAuthMiddleware`)
- Optional request tracing helpers (`RequestTracingMiddleware`)
- Health monitoring helpers (`HealthCheckHandler`, `ServiceHealthMonitor`)

This page documents what is implemented in the framework today.

## Enable Microservices Mode

Microservices mode is controlled by environment variables:

- `MICROSERVICES=true` enables discovery/bootstrapping
- `ENABLE_MICROSERVICES=true` exists as a legacy/test fallback
- `SERVICES=name1,name2` acts as an allow-list (when set, only those services are registered)

## Service Layout and `service.config.json`

### Default discovery directory

`MicroserviceBootstrap` discovers services under:

`src/services/<domain>/<service>/service.config.json`

Each discovered service is registered with the manager using its `name` and `domain`.

### Custom discovery directory

If your services live somewhere else (for example the standalone generator outputs `services/<domain>/<service>`), you can point the bootstrapper at that directory:

```ts
import { MicroserviceBootstrap } from '@zintrust/core';

const bootstrap = MicroserviceBootstrap.getInstance();
bootstrap.setServicesDir('services');
await bootstrap.initialize();
```

### Config schema

The framework reads `service.config.json` and normalizes it into a runtime `ServiceConfig`:

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
- `domain` is derived from the directory path (`src/services/<domain>/...`) and must match your layout.

## Bootstrapping and Registration

The recommended initialization flow is:

```ts
import { MicroserviceBootstrap } from '@zintrust/core';

await MicroserviceBootstrap.getInstance().initialize();
```

What this does:

1. If microservices are disabled, it returns early.
2. Discovers services from the configured services directory.
3. Registers them with `MicroserviceManager`.
4. Logs migration-related info when a service config has `database.migrations: true`.

## Inter-Service Communication

Use `MicroserviceManager.callService()` to call a registered service.

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

- The manager will throw if the service is not registered.
- The manager will throw if the service is not in `running` status.
- `callService()` uses `fetch()` and runs URL validation for SSRF protection.

## Health Checks

ZinTrust does not automatically add a health route to your service. You must implement an endpoint and point `healthCheck` to it.

For convenience, the framework includes `HealthCheckHandler`:

```ts
import { HealthCheckHandler } from '@zintrust/core';

const health = HealthCheckHandler.create('users', '1.0.0', 3001, 'ecommerce');

// Mount `health.handle` on your service route, e.g. GET /health
```

For polling multiple services from a monitoring process, use `ServiceHealthMonitor` (it is a helper, not automatically wired into the runtime).

## Service-to-Service Authentication

`ServiceAuthMiddleware` supports `api-key`, `jwt`, `none`, and `custom` strategies.

- Configure `SERVICE_API_KEY` or `SERVICE_JWT_SECRET` in production.
- Add the middleware to the service request pipeline to enforce that calls are authenticated.

## Request Tracing

`RequestTracingMiddleware` can:

- Attach and log `x-trace-id` and related headers on incoming requests.
- Provide an `injectHeaders()` helper for outgoing calls.

Propagation is not automatic in `callService()`; you must pass headers to the call.

## Docker Integration

The repository includes a microservices CLI that can generate/bundle/dockerize services (see `npm run microservices:*`). For containerized workflows, also see [microservices-docker.md](microservices-docker.md).
