# Service Discovery

In a microservices architecture, services need to find and communicate with each other. Zintrust provides a built-in service discovery mechanism.

## How it Works

Zintrust uses a file-based discovery system by default, which is perfect for development and small-to-medium deployments.

1. Each service has a `service.config.json`.
2. The `ServiceManager` scans the `services/` directory.
3. It builds a registry of available services and their endpoints.

## Service Configuration

```json
{
  "name": "inventory-service",
  "port": 3005,
  "host": "localhost",
  "healthCheck": "/health"
}
```

## Discovering Services

You can list all discovered services using the CLI:

```bash
zin microservices:discover
```

## Health Monitoring

The `ServiceManager` periodically pings each service's health check endpoint. If a service is down, it's marked as unhealthy in the registry.

```typescript
import { ServiceManager } from '@microservices/ServiceManager';

const isHealthy = await ServiceManager.isHealthy('inventory-service');
```

## Custom Discovery Drivers

For larger deployments, you can implement custom discovery drivers for Consul, Etcd, or Kubernetes:

```typescript
import { DiscoveryDriver } from '@microservices/types';

class ConsulDriver implements DiscoveryDriver {
  async resolve(serviceName: string): Promise<string> {
    // Consul lookup logic
  }
}
```
