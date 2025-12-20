# Microservices Advanced Features

## Database Isolation Strategies

Choose how services share or isolate database resources:

### Shared Database (Recommended for Small Teams)

All services use same PostgreSQL instance with separate schemas:

```json
{
  "database": {
    "isolation": "shared",
    "migrations": true
  }
}
```

**Benefits:**
- Single database to manage and backup
- Easier joins across service data (if needed)
- Lower infrastructure cost

**Usage:**
```typescript
import { PostgresAdapter } from '@microservices/PostgresAdapter';

const adapter = new PostgresAdapter({
  host: 'postgres',
  port: 5432,
  database: 'zintrust',
  user: 'postgres',
  password: 'postgres',
  isolation: 'shared',
  serviceName: 'users'
});

await adapter.connect();
await adapter.createServiceSchema('ecommerce_users');

// Query with schema prefix
const result = await adapter.query(
  'SELECT * FROM ecommerce_users.users WHERE id = $1',
  [1]
);
```

### Isolated Database (Recommended for Large Teams)

Each service has its own PostgreSQL instance:

```json
{
  "database": {
    "isolation": "isolated",
    "migrations": true
  }
}
```

**Benefits:**
- Complete data isolation
- Service can have own schema design
- Easy to scale/migrate individual service

**Usage:**
```typescript
const adapter = new PostgresAdapter({
  host: 'postgres',
  port: 5432,
  database: 'zintrust_payments', // Service-specific DB
  user: 'postgres',
  password: 'postgres',
  isolation: 'isolated',
  serviceName: 'payments'
});

await adapter.connect();

const result = await adapter.query(
  'SELECT * FROM payments WHERE id = $1',
  [1]
);
```

### Connection Pooling

Both strategies support connection pooling:

```typescript
const adapter = new PostgresAdapter({
  host: 'postgres',
  port: 5432,
  database: 'zintrust',
  user: 'postgres',
  password: 'postgres',
  max: 20, // Max connections in pool
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000
});

await adapter.connect();

// Get pool statistics
const stats = adapter.getPoolStats();
console.log(`Connections: ${stats.totalConnections}, Idle: ${stats.idleConnections}`);

// Run transaction
await adapter.transaction(async (client) => {
  await client.query('INSERT INTO users (email, name) VALUES ($1, $2)', 
    ['user@example.com', 'John']);
  await client.query('INSERT INTO user_profiles (user_id, bio) VALUES ($1, $2)', 
    [userId, 'Developer']);
});
```

## Service Bootstrap & Discovery

Auto-discover and initialize microservices:

```typescript
import { MicroserviceBootstrap } from '@microservices/MicroserviceBootstrap';

const bootstrap = MicroserviceBootstrap.getInstance();

// Discover all services from services/ directory
const services = await bootstrap.discoverServices();

// Register services with manager
await bootstrap.registerServices();

// Full initialization (discover, register, run migrations)
await bootstrap.initialize();
```

### Environment Configuration

```bash
# Enable microservices
export MICROSERVICES=true

# List of services to load (comma-separated)
export SERVICES=users,orders,payments

# Global tracing
export MICROSERVICES_TRACING=true
export MICROSERVICES_TRACING_RATE=0.5
```

## Integration Tests

Run comprehensive microservices tests:

```bash
# Run microservices integration tests
npm run test tests/integration/microservices.test.ts

# Tests include:
# - Service discovery
# - Service registry
# - Authentication strategies (API Key, JWT, Custom)
# - Request tracing
# - Health checks
# - Database isolation
# - PostgreSQL adapter
```

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    Microservices Architecture                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              MicroserviceBootstrap                       │  │
│  │  - Service Discovery from services/ directory           │  │
│  │  - Configuration loading from service.config.json       │  │
│  │  - Service registration with MicroserviceManager        │  │
│  └──────────────────────────────────────────────────────────┘  │
│           │                    │                   │             │
│           ▼                    ▼                   ▼             │
│  ┌────────────────┐  ┌────────────────┐  ┌──────────────────┐  │
│  │ Users Service  │  │ Orders Service │  │Payments Service  │  │
│  │ :3001          │  │ :3002          │  │ :3003            │  │
│  │                │  │                │  │                  │  │
│  │ ┌────────────┐ │  │ ┌────────────┐ │  │ ┌──────────────┐ │  │
│  │ │ServiceAuth │ │  │ │ServiceAuth │ │  │ │ServiceAuth   │ │  │
│  │ │Middleware  │ │  │ │Middleware  │ │  │ │Middleware    │ │  │
│  │ │api-key     │ │  │ │jwt         │ │  │ │none          │ │  │
│  │ └────────────┘ │  │ └────────────┘ │  │ └──────────────┘ │  │
│  │                │  │                │  │                  │  │
│  │ ┌────────────┐ │  │ ┌────────────┐ │  │ ┌──────────────┐ │  │
│  │ │RequestTrace│ │  │ │RequestTrace│ │  │ │RequestTrace  │ │  │
│  │ │Middleware  │ │  │ │Middleware  │ │  │ │Middleware    │ │  │
│  │ │enabled     │ │  │ │enabled     │ │  │ │disabled      │ │  │
│  │ └────────────┘ │  │ └────────────┘ │  │ └──────────────┘ │  │
│  │                │  │                │  │                  │  │
│  │ ┌────────────┐ │  │ ┌────────────┐ │  │ ┌──────────────┐ │  │
│  │ │Health      │ │  │ │Health      │ │  │ │Health        │ │  │
│  │ │CheckHandler│ │  │ │CheckHandler│ │  │ │CheckHandler  │ │  │
│  │ │ /health    │ │  │ │ /health    │ │  │ │ /health      │ │  │
│  │ └────────────┘ │  │ └────────────┘ │  │ └──────────────┘ │  │
│  └────────────────┘  └────────────────┘  └──────────────────┘  │
│           │                    │                   │             │
│           └────────────────────┼───────────────────┘             │
│                                │                                 │
│                   ┌────────────▼─────────────┐                   │
│                   │  ServiceHealthMonitor    │                   │
│                   │  - Continuous monitoring │                   │
│                   │  - Aggregated health     │                   │
│                   │  - Dependency checking   │                   │
│                   └────────────┬─────────────┘                   │
│                                │                                 │
│                   ┌────────────▼─────────────────────┐            │
│                   │  PostgreSQL (Shared or Isolated) │            │
│                   │  - Connection pooling            │            │
│                   │  - Schema isolation              │            │
│                   │  - Transaction support           │            │
│                   └──────────────────────────────────┘            │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Files Reference

| File | Purpose |
|------|---------|
| [src/microservices/MicroserviceBootstrap.ts](../src/microservices/MicroserviceBootstrap.ts) | Service discovery and initialization |
| [src/microservices/MicroserviceManager.ts](../src/microservices/MicroserviceManager.ts) | Service registry and inter-service communication |
| [src/microservices/ServiceAuthMiddleware.ts](../src/microservices/ServiceAuthMiddleware.ts) | Multi-strategy authentication (API Key, JWT, Custom) |
| [src/microservices/RequestTracingMiddleware.ts](../src/microservices/RequestTracingMiddleware.ts) | Cross-service request tracing |
| [src/microservices/ServiceHealthMonitor.ts](../src/microservices/ServiceHealthMonitor.ts) | Health checks and monitoring |
| [src/microservices/PostgresAdapter.ts](../src/microservices/PostgresAdapter.ts) | PostgreSQL adapter with connection pooling |
| [services/ecommerce/docker-compose.yml](../services/ecommerce/docker-compose.yml) | Multi-service orchestration |
| [services/ecommerce/init-db.sql](../services/ecommerce/init-db.sql) | Database initialization |
| [tests/integration/microservices.test.ts](../tests/integration/microservices.test.ts) | Integration tests |
