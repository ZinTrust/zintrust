# Microservices

Zintrust is designed from the ground up to support microservices architectures with zero external dependencies.

## Service Discovery

Services are automatically discovered if they contain a `service.config.json` file in their root directory.

```json
{
  "name": "user-service",
  "port": 3001,
  "auth": "jwt",
  "version": "1.0.0"
}
```

## Creating a Service

Use the CLI to scaffold a new service:

```bash
zin add service orders
```

This will create a new directory in `services/orders` with its own models, controllers, and configuration.

## Inter-Service Communication

Zintrust provides a type-safe way to communicate between services using `ServiceRequestFactory`.

```typescript
import { ServiceClient } from '@zintrust/core';

const userService = ServiceClient.for('user-service');
const user = await userService.get('/users/1');
```

## Health Checks

Every service automatically exposes a `GET /health` endpoint that returns the service status, memory usage, and uptime.

## Distributed Tracing

Zintrust automatically propagates an `x-trace-id` header across service boundaries, allowing you to track a single request as it flows through your entire system.

## Monitoring

Use the `zin debug` command to see a real-time dashboard of all running services, their health, and resource consumption.

## Docker Integration

Zintrust automatically generates Dockerfiles and Docker Compose configurations for your microservices. See the [Docker Integration Guide](microservices-docker.md) for more details.
