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
import { PostgresAdapter } from '@zintrust/core';

const adapter = new PostgresAdapter({
  host: 'postgres',
  port: 5432,
  database: 'zintrust',
  user: 'postgres',
  password: 'postgres',
  isolation: 'shared',
  serviceName: 'users',
});

await adapter.connect();
await adapter.createServiceSchema('ecommerce_users');

// Query using QueryBuilder (Recommended)
const { User } = await import('@app/Models/User');
const result = await User.query().where('id', 1).first();
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
  serviceName: 'payments',
});

await adapter.connect();

// Query using QueryBuilder (Recommended)
const { Payment } = await import('@app/Models/Payment');
const result = await Payment.query().where('id', 1).first();
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
  connectionTimeoutMillis: 2000,
});

await adapter.connect();

// Get pool statistics
const stats = adapter.getPoolStats();
Logger.info(`Connections: ${stats.totalConnections}, Idle: ${stats.idleConnections}`);

// Run transaction with QueryBuilder (Recommended)
const { User } = await import('@app/Models/User');
const { UserProfile } = await import('@app/Models/UserProfile');

await adapter.transaction(async () => {
  const user = await User.query().insert({
    email: 'user@example.com',
    name: 'John',
  });

  await UserProfile.query().insert({
    user_id: user.id,
    bio: 'Developer',
  });
});
```

## Raw SQL Queries (Advanced - Not Recommended)

> **⚠️ IMPORTANT:** Raw SQL queries violate ZinTrust's core philosophy of type-safe, zero-vulnerability database access. The QueryBuilder handles all standard operations safely. Raw SQL should **NEVER** be used unless absolutely necessary.

### When to Use Raw SQL

Only use raw SQL when:

1. A feature is genuinely unavailable in the QueryBuilder
2. You have exhausted all QueryBuilder options
3. You explicitly enable it via environment variable

### Enabling Raw SQL

Set the flag in your `.env`:

```bash
# Only enable for specific advanced use cases
USE_RAW_QRY=true
```

### Raw SQL Example

Once enabled via environment variable, you can execute raw queries:

```typescript
import { PostgresAdapter, Env } from '@zintrust/core';

const adapter = new PostgresAdapter({
  host: 'postgres',
  port: 5432,
  database: 'zintrust',
  user: 'postgres',
  password: 'postgres',
});

await adapter.connect();

// Raw query available when USE_RAW_QRY=true (checked at app bootstrap)
const result = await adapter.rawQuery('SELECT * FROM users WHERE created_at > $1', [
  new Date('2024-01-01'),
]);
```

**Per-Adapter Parameter Syntax:**

| Adapter       | Syntax                | Example                                   |
| ------------- | --------------------- | ----------------------------------------- |
| PostgreSQL    | `$1, $2, $3...`       | `WHERE id = $1 AND status = $2`           |
| MySQL         | `?, ?, ?...`          | `WHERE id = ? AND status = ?`             |
| SQLite        | `$1, $2, $3...`       | `WHERE id = $1 AND status = $2`           |
| SQL Server    | `@param0, @param1...` | `WHERE id = @param0 AND status = @param1` |
| Cloudflare D1 | `?, ?, ?...`          | `WHERE id = ? AND status = ?`             |

**Instead, use QueryBuilder (Recommended):**

```typescript
// ✅ Recommended approach - type-safe and secure
const { User } = await import('@app/Models/User');
const result = await User.query().where('created_at', '>', new Date('2024-01-01')).get();
```

## Service Bootstrap & Discovery

Auto-discover and initialize microservices:

```typescript
import { MicroserviceBootstrap } from '@zintrust/core';

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
│                    Microservices Architecture                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              MicroserviceBootstrap                       │   │
│  │  - Service Discovery from services/ directory            │   │
│  │  - Configuration loading from service.config.json          │   │
│  │  - Service registration with MicroserviceManager         │   │
│  └──────────────────────────────────────────────────────────┘   │
│           │                    │                   │            │
│           ▼                    ▼                   ▼            │
│  ┌────────────────┐  ┌────────────────┐  ┌──────────────────┐   │
│  │ Users Service  │  │ Orders Service │  │Payments Service  │   │
│  │ :3001          │  │ :3002          │  │ :7777            │   │
│  │                │  │                │  │                  │   │
│  │ ┌────────────┐ │  │ ┌────────────┐ │  │ ┌──────────────┐ │   │
│  │ │ServiceAuth │ │  │ │ServiceAuth │ │  │ │ServiceAuth   │ │   │
│  │ │Middleware  │ │  │ │Middleware  │ │  │ │Middleware    │ │   │
│  │ │api-key     │ │  │ │jwt         │ │  │ │none          │ │   │
│  │ └────────────┘ │  │ └────────────┘ │  │ └──────────────┘ │   │
│  │                │  │                │  │                  │   │
│  │ ┌────────────┐ │  │ ┌────────────┐ │  │ ┌──────────────┐ │   │
│  │ │RequestTrace│ │  │ │RequestTrace│ │  │ │RequestTrace  │ │   │
│  │ │Middleware  │ │  │ │Middleware  │ │  │ │Middleware    │ │   │
│  │ │enabled     │ │  │ │enabled     │ │  │ │disabled      │ │   │
│  │ └────────────┘ │  │ └────────────┘ │  │ └──────────────┘ │   │
│  │                │  │                │  │                  │   │
│  │ ┌────────────┐ │  │ ┌────────────┐ │  │ ┌──────────────┐ │   │
│  │ │Health      │ │  │ │Health      │ │  │ │Health        │ │   │
│  │ │CheckHandler│ │  │ │CheckHandler│ │  │ │CheckHandler  │ │   │
│  │ │ /health    │ │  │ │ /health    │ │  │ │ /health      │ │   │
│  │ └────────────┘ │  │ └────────────┘ │  │ └──────────────┘ │   │
│  └────────────────┘  └────────────────┘  └──────────────────┘   │
│           │                    │                   │            │
│           └────────────────────┼───────────────────┘            │
│                                │                                │
│                   ┌────────────▼─────────────┐                  │
│                   │  ServiceHealthMonitor    │                  │
│                   │  - Continuous monitoring │                  │
│                   │  - Aggregated health     │                  │
│                   │  - Dependency checking   │                  │
│                   └────────────┬─────────────┘                  │
│                                │                                │
│                   ┌────────────▼─────────────────────┐          │
│                   │  PostgreSQL (Shared or Isolated) │          │
│                   │  - Connection pooling            │          │
│                   │  - Schema isolation              │          │
│                   │  - Transaction support           │          │
│                   └──────────────────────────────────┘          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Files Reference

| File                                                                                              | Purpose                                              |
| ------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| [src/microservices/MicroserviceBootstrap.ts](../src/microservices/MicroserviceBootstrap.ts)       | Service discovery and initialization                 |
| [src/microservices/MicroserviceManager.ts](../src/microservices/MicroserviceManager.ts)           | Service registry and inter-service communication     |
| [src/microservices/ServiceAuthMiddleware.ts](../src/microservices/ServiceAuthMiddleware.ts)       | Multi-strategy authentication (API Key, JWT, Custom) |
| [src/microservices/RequestTracingMiddleware.ts](../src/microservices/RequestTracingMiddleware.ts) | Cross-service request tracing                        |
| [src/microservices/ServiceHealthMonitor.ts](../src/microservices/ServiceHealthMonitor.ts)         | Health checks and monitoring                         |
| [src/microservices/PostgresAdapter.ts](../src/microservices/PostgresAdapter.ts)                   | PostgreSQL adapter with connection pooling           |
| [services/ecommerce/docker-compose.yml](../services/ecommerce/docker-compose.yml)                 | Multi-service orchestration                          |
| [services/ecommerce/init-db.sql](../services/ecommerce/init-db.sql)                               | Database initialization                              |
| [tests/integration/microservices.test.ts](../tests/integration/microservices.test.ts)             | Integration tests                                    |
