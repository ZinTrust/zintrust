# Service Discovery

Service discovery in ZinTrust is currently a **filesystem + in-memory registry** model:

- Filesystem discovery is handled by `MicroserviceBootstrap`.
- Registered services live in an in-memory map owned by `MicroserviceManager`.

There is no pluggable “discovery driver” API in the runtime today.

## Filesystem Discovery (recommended for local/dev)

When microservices are enabled (`MICROSERVICES=true`), `MicroserviceBootstrap` discovers services by scanning a services directory for:

`<servicesDir>/<domain>/<service>/service.config.json`

By default, `servicesDir` is `src/services`.

### Example structure

```
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
  "version": "1.0.0",
  "port": 3001,
  "healthCheck": "/health",
  "dependencies": ["orders"]
}
```

### Bootstrapping discovery

```ts
import { MicroserviceBootstrap } from '@zintrust/core';

await MicroserviceBootstrap.getInstance().initialize();
```

This discovers configs and registers them with `MicroserviceManager`.

## In-Memory Registry (`MicroserviceManager`)

Once registered, services can be listed and called via the manager:

```ts
import { MicroserviceManager } from '@zintrust/core';

const manager = MicroserviceManager.getInstance();

// Returns the currently registered services (it does not scan the filesystem)
const services = await MicroserviceManager.discoverServices();

// Call a running service
await manager.startService('users');
const response = await manager.callService('users', '/health');
```

## Allow-List via `SERVICES`

If `SERVICES` is set (comma-separated), the framework treats it as an allow-list:

- Services not listed will be skipped during registration.
- If `SERVICES` is unset/empty, all discovered services are eligible.

## Health Checks

The manager can health-check registered services by requesting their configured health path:

```ts
import { MicroserviceManager } from '@zintrust/core';

const manager = MicroserviceManager.getInstance();
const healthy = await manager.checkServiceHealth('users');
```

Health checks depend on your services:

- The endpoint must exist.
- `healthCheck` in `service.config.json` must match the path your service exposes.

## CLI

This repo includes helper commands for generating and inspecting microservices:

- `npm run microservices:generate`
- `npm run microservices:discover`
- `npm run microservices:status`
- `npm run microservices:health`

Note: the CLI “discover” command reports what `MicroserviceManager.discoverServices()` returns (registered services), not filesystem scanning.
