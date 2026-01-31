# Worker Management System

Enterprise-grade worker management system for ZinTrust Framework with comprehensive features including health monitoring, auto-scaling, compliance, versioning, canary deployments, and multi-datacenter orchestration.

## Table of Contents

- [Overview](#overview)
- [Quick Start](#quick-start)
- [Environment Variables](#environment-variables)
- [CLI Quick List](#cli-quick-list)
- [Core Concepts](#core-concepts)
- [Configuration](#configuration)
- [Worker Auto-Start Configuration](#worker-auto-start-configuration)
- [CLI Commands](#cli-commands)
- [HTTP API](#http-api)
- [Features](#features)
- [Architecture](#architecture)
- [Examples](#examples)
- [Troubleshooting](#troubleshooting)

## Overview

The Worker Management System provides enterprise-level features for managing background jobs and workers:

- **Core Infrastructure**: Worker registry, distributed locks, metrics, priority queues
- **Resilience**: Circuit breakers, dead letter queues, health monitoring, auto-recovery
- **Scaling**: Auto-scaling based on queue depth and resource usage, manual scaling controls
- **Monitoring**: Comprehensive metrics, health checks, resource monitoring, observability
- **Compliance**: GDPR, HIPAA, SOC2 compliance features including encryption and audit logging
- **Versioning**: Rolling updates, version compatibility checks, rollback capabilities
- **Canary Deployments**: Progressive traffic shifting with automatic rollback
- **Multi-Datacenter**: Cross-region orchestration, failover policies, topology management
- **Cost Optimization**: Resource tracking, cost analysis, spot instance support
- **Plugin System**: Extensible architecture with lifecycle hooks

## Quick Start

### 0. Install the workers package

```bash
npm install @zintrust/workers
```

Use the workers package directly:

```typescript
import { WorkerFactory } from '@zintrust/workers';
```

Or continue importing from core if you prefer (core re-exports the workers API when the package is installed):

```typescript
import { WorkerFactory } from '@zintrust/core';
```

## Environment Variables

These environment variables control worker behavior. Set only what you need.

**Core Worker Settings**

| Key                          | Description                        | Default   |
| ---------------------------- | ---------------------------------- | --------- |
| WORKERS_ENABLED              | Global worker system toggle        | true      |
| WORKER_ENABLED               | Default worker enabled flag        | true      |
| WORKER_CONCURRENCY           | Default concurrency                | 5         |
| WORKER_TIMEOUT               | Job timeout (seconds)              | 60        |
| WORKER_CONNECTION_TIMEOUT    | Worker connection timeout (ms)     | 5000      |
| WORKER_RETRIES               | Retry attempts                     | 3         |
| WORKER_AUTO_START            | Auto-start worker                  | false     |
| WORKER_RESOURCE_MONITORING   | Global resource monitoring gate    | true      |
| WORKER_PRIORITY              | Default priority                   | 1         |
| WORKER_HEALTH_CHECK_INTERVAL | Health check interval (seconds)    | 60        |
| WORKER_INTERVAL_MS           | Monitoring interval (milliseconds) | 5000      |
| WORKER_CLUSTER_MODE          | Enable cluster mode                | true      |
| WORKER_REGION                | Default region                     | us-east-1 |

**Auto-Scaling**

| Key                              | Description                     | Default     |
| -------------------------------- | ------------------------------- | ----------- |
| WORKER_AUTO_SCALING_ENABLED      | Enable auto-scaling             | false       |
| WORKER_AUTO_SCALING_INTERVAL     | Evaluation interval (seconds)   | 30          |
| WORKER_OFF_PEAK_SCHEDULE         | Off-peak schedule (HH:MM-HH:MM) | 22:00-06:00 |
| WORKER_OFF_PEAK_REDUCTION        | Off-peak reduction ratio        | 0.7         |
| WORKER_COST_OPTIMIZATION_ENABLED | Enable cost optimization        | false       |
| WORKER_SPOT_INSTANCES            | Prefer spot instances           | false       |
| WORKER_OFF_PEAK_SCALING          | Enable off-peak scaling         | false       |

**Compliance**

| Key                   | Description           | Default |
| --------------------- | --------------------- | ------- |
| WORKER_AUDIT_LOG      | Enable audit logging  | true    |
| WORKER_ENCRYPTION     | Enable encryption     | true    |
| WORKER_DATA_RETENTION | Retention days        | 90      |
| WORKER_GDPR           | Enable GDPR controls  | false   |
| WORKER_HIPAA          | Enable HIPAA controls | false   |
| WORKER_SOC2           | Enable SOC2 controls  | true    |

**Observability**

| Key                           | Description               | Default               |
| ----------------------------- | ------------------------- | --------------------- |
| WORKER_PROMETHEUS_ENABLED     | Enable Prometheus metrics | false                 |
| WORKER_PROMETHEUS_PORT        | Prometheus port           | 9090                  |
| WORKER_OPENTELEMETRY_ENABLED  | Enable OpenTelemetry      | false                 |
| WORKER_OPENTELEMETRY_ENDPOINT | OpenTelemetry endpoint    | http://localhost:4318 |
| WORKER_DATADOG_ENABLED        | Enable Datadog            | false                 |
| WORKER_DATADOG_API_KEY        | Datadog API key           | (empty)               |

**Redis Configuration**

Redis configuration is now managed through the queue configuration system. See `config/queue.ts` for Redis driver settings including host, port, password, and database configuration.

**Persistence**

| Key                                 | Description                                                         | Default                           |
| ----------------------------------- | ------------------------------------------------------------------- | --------------------------------- |
| WORKER_PERSISTENCE_DRIVER           | Persistence driver: memory, redis, db                               | memory                            |
| WORKER_PERSISTENCE_DB_CONNECTION    | Named DB connection to use when driver=db and no client is provided | default                           |
| WORKER_PERSISTENCE_TABLE            | Table name for DB persistence                                       | zintrust_workers                  |
| WORKER_PERSISTENCE_REDIS_KEY_PREFIX | Redis hash key prefix when driver=redis                             | APP*NAME (spaces replaced with *) |

**Logging**

| Key         | Description       | Default |
| ----------- | ----------------- | ------- |
| LOG_LEVEL   | Minimum log level | info    |
| LOG_CHANNEL | Output channel    | console |
| LOG_FORMAT  | text or json      | text    |

## CLI Quick List

```bash
# Worker lifecycle
zin worker:list
zin worker:status my-worker
zin worker:start my-worker
zin worker:stop my-worker
zin worker:restart my-worker
zin worker:summary

# Resource monitoring
zin resource:monitor start
zin resource:monitor stop

# Worker migrations
zin migrate:worker
zin migrate:worker --status
zin migrate:worker --fresh
zin migrate:worker --rollback --step 1
zin migrate:worker --reset
zin migrate:worker --all
```

### 1. Define Workers

Create your workers in `routes/workers.ts`:

```typescript
import { WorkerFactory } from '@zintrust/workers';
import { Job } from 'bullmq';

// Define worker
export async function initializeWorkers() {
  await WorkerFactory.create({
    name: 'email-sender',
    queueName: 'emails',
    concurrency: 5,
    processor: async (job: Job) => {
      const { to, subject, body } = job.data;
      // Send email logic
      await sendEmail(to, subject, body);
      return { sent: true, messageId: '123' };
    },
    healthCheck: async () => {
      // Check email service connection
      return { healthy: true };
    },
  });
}
```

**Auto-start behavior**

Workers start automatically when you call `WorkerFactory.create()` based on the following logic:

| Worker Config `autoStart` | `WORKER_AUTO_START` | Result                                                     |
| ------------------------- | ------------------- | ---------------------------------------------------------- |
| `true`                    | `true`              | **Starts** (both true)                                     |
| `false`                   | `false`             | **Doesn't start** (both false)                             |
| `true`                    | `false`             | **Doesn't start** (global override)                        |
| `false`                   | `true`              | **Doesn't start** (worker config)                          |
| `null`                    | `true`              | **Starts** (uses global setting)                           |
| `null`                    | `false`             | **Doesn't start** (both false)                             |
| `undefined`               | `true`              | **Starts** (uses global setting)                           |
| `undefined`               | `false`             | **Doesn't start** (uses global setting)                    |
| `undefined`               | `null`              | **Doesn't start** (uses global setting, defaults to false) |

**Key Rules:**

1. **`WORKER_AUTO_START` acts as a global kill switch** - when `false`, NO workers auto-start regardless of their individual config
2. If `WORKER_AUTO_START` is `true`, then individual worker `autoStart` settings are respected:
   - `autoStart: true` → Worker starts
   - `autoStart: false` → Worker doesn't start
   - `autoStart: null`/`undefined` → Worker starts (uses global setting)
3. `WORKER_AUTO_START` defaults to `false` if not set
4. `autoStart: null` and `autoStart: undefined` both behave the same - they use the global `WORKER_AUTO_START` setting

Set `autoStart: false` to register a worker without starting it, then use CLI or HTTP start endpoints (`worker:start` or `POST /api/workers/:name/start`) when you are ready.

## Worker Auto-Start Configuration

### Overview

Worker auto-start functionality in ZinTrust is designed to provide controlled initialization of workers based on persistence driver compatibility. This is a security and resource management feature to prevent uncontrolled worker initialization.

### Auto-Start Behavior

Only workers that use the **WORKER_PERSISTENCE_DRIVER** are eligible for automatic startup when auto-start is enabled. Workers with different persistence drivers must be started manually.

```bash
# Environment configuration
WORKER_PERSISTENCE_DRIVER=redis  # or mongodb, memory, etc.
WORKER_AUTO_START=true           # Enable auto-start for persistence driver workers
```

### Supported Persistence Drivers

The following persistence drivers support auto-start:

- **Redis** (`redis`) - Workers using Redis backend
- **MongoDB** (`mongodb`) - Workers using MongoDB backend
- **Memory** (`memory`) - Workers using in-memory backend
- **Cloudflare D1** (`cloudflare-d1`) - Workers using Cloudflare D1 backend

### Workers Requiring Manual Start

Workers that use **different persistence drivers** than `WORKER_PERSISTENCE_DRIVER` must be started manually:

- **Via API:** `POST /api/workers/{workerName}/start`
- **Via CLI:** `zin worker:start {workerName}`

### Resource Monitoring Environment Gate

Resource monitoring is controlled by both a global environment variable and worker-level settings:

```bash
# Global environment gate
WORKER_RESOURCE_MONITORING=true    # Default: true
```

#### Logic Flow:

1. **Environment Gate Check:** If `WORKER_RESOURCE_MONITORING=false`, resource monitoring is **completely disabled**
2. **Worker-Level Check:** If environment allows, checks if any worker has `"resourceMonitoring": true`
3. **Startup Decision:** Resource monitor starts only if **both conditions are met**

#### Scenarios:

| WORKER_RESOURCE_MONITORING | Worker resourceMonitoring | Result                       |
| -------------------------- | ------------------------- | ---------------------------- |
| `true` (default)           | `true`                    | ✅ Starts                    |
| `true` (default)           | `false`                   | ⏸️ Doesn't start             |
| `false`                    | `true`                    | ❌ Blocked by env            |
| `false`                    | `false`                   | ❌ Blocked by env            |
| `unset`                    | `true`                    | ✅ Starts (defaults to true) |

#### Example:

```bash
# Environment
WORKER_RESOURCE_MONITORING=true

# Worker 1 - Will start monitoring
{
  "name": "monitoring-worker",
  "features": {
    "resourceMonitoring": true
  }
}

# Worker 2 - Won't affect monitoring
{
  "name": "quiet-worker",
  "features": {
    "resourceMonitoring": false
  }
}

# Result: Resource monitoring starts (Worker 1 requested it)
```

### Configuration Examples

#### Redis Auto-Start Example

```bash
# .env configuration
WORKER_PERSISTENCE_DRIVER=redis
WORKER_AUTO_START=true

# Workers with Redis persistence will auto-start:
# - example-test-redis6 (persistence: { driver: "redis" })
# - email-queue-worker (persistence: { driver: "redis" })

# Workers with other persistence need manual start:
# - mysql-worker (persistence: { driver: "mysql" }) → Manual start required
# - postgres-worker (persistence: { driver: "postgres" }) → Manual start required
```

#### MongoDB Auto-Start Example

```bash
# .env configuration
WORKER_PERSISTENCE_DRIVER=mongodb
WORKER_AUTO_START=true

# Workers with MongoDB persistence will auto-start:
# - analytics-worker (persistence: { driver: "mongodb" })
# - report-generator (persistence: { driver: "mongodb" })

# Workers with other persistence need manual start:
# - redis-worker (persistence: { driver: "redis" }) → Manual start required
# - memory-worker (persistence: { driver: "memory" }) → Manual start required
```

### Worker Configuration Format

#### Auto-Start Eligible Worker

```json
{
  "name": "example-test-redis6",
  "persistence": {
    "driver": "redis" // Uses queueConfig.drivers.redis from config/queue.ts
  },
  "autoStart": true // Optional: explicit auto-start flag
}
```

#### Manual Start Required Worker

```json
{
  "name": "mysql-worker",
  "persistence": {
    "driver": "mysql" // Different from WORKER_PERSISTENCE_DRIVER
  },
  "autoStart": false // Explicitly disabled
}
```

### Manual Worker Control

#### API Endpoints

```bash
# Start a worker manually
POST /api/workers/{workerName}/start

# Stop a worker
POST /api/workers/{workerName}/stop

# Check worker status
GET /api/workers/{workerName}/status

# List all workers
GET /api/workers
```

#### CLI Commands

```bash
# Start a worker manually
zin worker:start {workerName}

# Stop a worker
zin worker:stop {workerName}

# List workers
zin worker:list

# Show worker details
zin worker:show {workerName}
```

### Security Considerations

1. **Resource Control:** Auto-start is limited to one persistence driver to prevent resource exhaustion
2. **Explicit Control:** Non-standard persistence drivers require explicit manual start
3. **Configuration Validation:** Workers are validated before auto-start
4. **Error Handling:** Failed auto-starts are logged but don't block other workers

### Troubleshooting

#### Worker Not Auto-Starting

Check the following:

1. `WORKER_AUTO_START=true` is set in environment
2. Worker's `persistence.driver` matches `WORKER_PERSISTENCE_DRIVER`
3. Worker configuration is valid
4. Persistence backend is accessible

#### Manual Start Failing

Check:

1. Worker exists in registry
2. Persistence backend is available
3. Required environment variables are set
4. Worker configuration is correct

### Best Practices

1. **Use Consistent Persistence:** Keep most workers on the same persistence driver for easier management
2. **Explicit Configuration:** Always specify `persistence.driver` in worker configs
3. **Monitor Auto-Start:** Check logs for auto-start failures
4. **Resource Planning:** Consider resource needs when enabling auto-start

**Processor registration (start from persistence)**

If you want `POST /api/workers/:name/start` to auto-register a worker from persistence, register its processor at boot. You can do this with a direct function, bulk registration, or a file-based resolver.

```typescript
import { WorkerFactory } from '@zintrust/workers';

WorkerFactory.registerProcessor('email-sender', async (job) => {
  // ...process job
  return job.data;
});

WorkerFactory.registerProcessors({
  'example-test': async (job) => job.data,
  'example-test-mysql': async (job) => job.data,
});

WorkerFactory.registerProcessorPaths({
  'email-sender': './processors/emailProcessor.ts',
});

WorkerFactory.registerProcessorResolver(async (name) => {
  if (name === 'special') return async (job) => job.data;
  return undefined;
});
```

**Process management**

In production, run the worker service as a long-lived process (for example systemd, PM2, Docker, or Kubernetes). Cron is not required; workers are continuous services that should stay running.

### 2. CLI Commands

```bash
# List all workers
zintrust worker:list

# Get worker status
zintrust worker:status email-sender

# Start a worker
zintrust worker:start email-sender

# Stop a worker
zintrust worker:stop email-sender

# Restart a worker
zintrust worker:restart email-sender

# System summary
zintrust worker:summary
```

### 3. HTTP API

```bash
# Create a worker
curl -X POST http://localhost:7777/api/workers \\
  -H "Content-Type: application/json" \\
  -d '{"name": "email-sender", "queueName": "emails", "concurrency": 5}'

# Start a worker
curl -X POST http://localhost:7777/api/workers/email-sender/start

# Get worker status
curl http://localhost:7777/api/workers/email-sender/status

# Get health metrics
curl http://localhost:7777/api/workers/email-sender/health
```

## Core Concepts

### Workers

A **worker** processes jobs from a queue. Each worker has:

- **Name**: Unique identifier
- **Queue**: Source of jobs
- **Processor**: Function that handles job execution
- **Concurrency**: Number of parallel jobs
- **Health Check**: Function to verify worker health

### Jobs

Jobs are units of work added to queues and processed by workers. Jobs have:

- **Data**: Payload containing job information
- **Options**: Priority, attempts, backoff, delay
- **Status**: Waiting, active, completed, failed, delayed

### Queues

Queues store jobs and provide them to workers:

- **Priority Levels**: Critical (10), High (5), Normal (1), Low (0)
- **Job Scheduling**: Immediate, delayed, recurring (cron)
- **Persistence**: Redis-backed for durability

## Configuration

### Queue Configuration (`config/queue.ts`)

Redis and other queue driver configurations are now managed through the queue configuration system:

```typescript
import { type QueueConfigWithDrivers } from '@config/type';

export const queueConfig: QueueConfigWithDrivers = {
  default: 'redis',
  drivers: {
    redis: {
      host: process.env.REDIS_HOST ?? 'localhost',
      port: Number(process.env.REDIS_PORT) || 6379,
      password: process.env.REDIS_PASSWORD,
      db: Number(process.env.REDIS_QUEUE_DB) || 0,
      // Additional Redis options
      maxRetriesPerRequest: 3,
      retryDelayOnFailover: 100,
      lazyConnect: true,
    },
    // Other drivers can be configured here
    memory: {},
    mongodb: {
      url: process.env.MONGODB_URL,
      dbName: 'zintrust_workers',
    },
  },
  // Queue processing settings
  processing: {
    timeout: 60,
    retries: 3,
    backoff: 2000,
    workers: 5,
  },
};
```

### Developer Config (`config/workers.ts`)

Runtime configuration for your workers (Redis config removed - use queue config):

```typescript
import { type IWorkerConfig } from '@config/workers';

export const workerConfig: IWorkerConfig = {
  workers: {
    'email-sender': {
      queueName: 'emails',
      concurrency: 5,
      rateLimit: {
        max: 100,
        duration: 60000, // 1 minute
      },
    },
  },
  autoScaling: {
    enabled: false, // Enable in production
    minWorkers: 1,
    maxWorkers: 10,
    scaleUpThreshold: 100, // Jobs in queue
    scaleDownThreshold: 10,
  },
  monitoring: {
    healthCheckInterval: 30000,
    metricsRetention: 86400000, // 24 hours
  },
  compliance: {
    gdpr: {
      enabled: true,
      dataRetentionDays: 90,
    },
    hipaa: {
      enabled: false,
      auditRetentionYears: 6,
    },
  },
};
```

### Persistence Options

Workers can be persisted in **memory**, **Redis**, or **DB**.

**Memory (default)**

```typescript
await WorkerFactory.create({
  name: 'email-sender',
  queueName: 'emails',
  processor: async (job) => job.data,
  infrastructure: {
    persistence: { driver: 'memory' },
  },
});
```

**Redis persistence**

```typescript
await WorkerFactory.create({
  name: 'email-sender',
  queueName: 'emails',
  processor: async (job) => job.data,
  infrastructure: {
    redis: { env: true },
    persistence: { driver: 'redis' },
  },
});
```

**DB persistence (connected client optional)**

```typescript
import { Database } from '@orm/Database';

const db = Database.create(databaseConfig.getConnection());
await db.connect();

await WorkerFactory.create({
  name: 'email-sender',
  queueName: 'emails',
  processor: async (job) => job.data,
  infrastructure: {
    persistence: { driver: 'db', client: db },
  },
});

// Or rely on a registered connection without passing a client
await WorkerFactory.create({
  name: 'email-sender',
  queueName: 'emails',
  processor: async (job) => job.data,
  infrastructure: {
    persistence: { driver: 'db', connection: 'mysql' },
  },
});
```

**DB persistence via environment (no explicit client in code)**

```bash
WORKER_PERSISTENCE_DRIVER=db
WORKER_PERSISTENCE_DB_CONNECTION=default
WORKER_PERSISTENCE_TABLE=zintrust_workers
```

`WORKER_PERSISTENCE_DB_CONNECTION` must match a connection key in `config/database.ts` (for example `mysql`, `postgresql`, `sqlite`, `sqlserver`, `d1`, `d1-remote`) or any custom key you define. If you omit it, the default connection uses `DB_CONNECTION` from your environment.

```typescript
await WorkerFactory.create({
  name: 'email-sender',
  queueName: 'emails',
  processor: async (job) => job.data,
  infrastructure: {
    persistence: { driver: 'db' },
  },
});
```

**What each option means**

- `driver`: Selects the storage backend. `memory` keeps workers in-process only, `redis` stores them in Redis, and `db` stores them in your SQL database.
- `client`: The connected `IDatabase` instance to use for `db` persistence. If omitted, the worker system will try to resolve a registered connection using `WORKER_PERSISTENCE_DB_CONNECTION`.
- `connection`: Optional name of a registered database connection (for example `default`). Used only when `client` is not supplied. Connection names come from the keys in `config/database.ts` (for example `sqlite`, `mysql`, `postgresql`, `sqlserver`, `d1`, `d1-remote`) and any custom keys you define.
- `table`: DB table used to store worker records (defaults to `zintrust_workers`).
- `redis`: Redis configuration for persistence when `driver=redis`. Uses `queueConfig.drivers.redis` from `config/queue.ts`. See the Queue Configuration section for Redis settings.
- `keyPrefix`: Redis hash key prefix for persisted worker records. Defaults to `APP_NAME` with spaces replaced by `_` when `WORKER_PERSISTENCE_REDIS_KEY_PREFIX` is not set.

## CLI Commands

### worker:list

List all workers with their status:

```bash
zintrust worker:list
```

Output:

```
┌──────────────┬──────────┬─────────┬───────────┬─────────────┐
│ Name         │ Status   │ Version │ Queue     │ Concurrency │
├──────────────┼──────────┼─────────┼───────────┼─────────────┤
│ email-sender │ active   │ 1.0.0   │ emails    │ 5           │
│ pdf-gen      │ active   │ 2.1.0   │ documents │ 3           │
│ notifier     │ stopped  │ 1.5.0   │ notify    │ 10          │
└──────────────┴──────────┴─────────┴───────────┴─────────────┘
```

### worker:status my-worker

Get detailed status for a specific worker:

```bash
zintrust worker:status email-sender
```

Output:

```
Worker Status: email-sender
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Status:      ✓ Active
Health:      95/100
Version:     1.0.0
Queue:       emails
Concurrency: 5/5

Metrics:
  Jobs Completed:  1,234
  Jobs Failed:     12
  Success Rate:    99.0%
  Avg Duration:    1.2s
```

### worker:start my-worker

Start a stopped worker:

```bash
zintrust worker:start email-sender
```

### worker:stop my-worker

Stop a running worker gracefully:

```bash
zintrust worker:stop email-sender
```

### worker:restart my-worker

Restart a worker:

```bash
zintrust worker:restart email-sender
```

### worker:summary

Show system-wide summary:

```bash
zintrust worker:summary
```

Output:

```
Worker Management System Summary
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Workers:     12 total (10 active, 2 stopped)
Health:      Excellent (avg 96/100)

Resources:
  CPU:       45%
  Memory:    2.3 GB / 8.0 GB
  Disk I/O:  120 MB/s

Costs (24h):
  Compute:   $12.45
  Storage:   $0.89
  Total:     $13.34
```

### queue:prune

Prune failed job records from the database. This is essential for maintaining database performance when using DB persistence or failed job logging.

```bash
# Prune jobs older than 7 days (default)
zin queue prune

# Prune jobs older than 24 hours
zin queue prune --hours 24
```

### resource:monitor (rm)

Control resource monitoring to start or stop CPU/memory snapshots:

```bash
# Stop resource monitoring (reduces log noise)
zin resource:monitor stop
zin rm stop  # Short alias

# Start resource monitoring
zin resource:monitor start
zin rm start  # Short alias

# With custom port
zin rm stop --port 8080

# With custom host
zin rm stop --host 192.168.1.100
```

**Options:**

- `<action>` - Required: `start` or `stop`
- `--port <port>` - Worker service port (default: 7777)
- `--host <host>` - Worker service host (default: 127.0.0.1)

**Examples:**

```bash
# Stop monitoring on default port
zin rm stop

# Start monitoring on custom port
zin rm start --port 8080

# Stop monitoring on remote server
zin rm stop --host 192.168.1.100 --port 7777
```

**Output:**

```bash
# Stop monitoring
$ zin rm stop
[INFO] Sending stop request
[INFO] Success: Resource monitoring stopped

# Start monitoring
$ zin rm start
[INFO] Sending start request
[INFO] Success: Resource monitoring started
```

**Use Cases:**

- Development: Reduce log noise during debugging
- Maintenance: Temporarily disable during operations
- Testing: Control monitoring programmatically
- Production: Emergency disable if monitoring causes issues

**Note:** This command sends HTTP requests to the running worker service. Ensure your workers are running before using this command.

## HTTP API

### Core Operations

#### Create Worker

```http
POST /api/workers
Content-Type: application/json

{
  "name": "email-sender",
  "queueName": "emails",
  "concurrency": 5,
  "processor": "EmailProcessor",
  "healthCheck": "EmailHealthCheck"
}
```

#### Start Worker

```http
POST /api/workers/:name/start
```

#### Stop Worker

```http
POST /api/workers/:name/stop
```

#### Restart Worker

```http
POST /api/workers/:name/restart
```

#### Get Worker Status

```http
GET /api/workers/:name/status
```

Response:

```json
{
  "ok": true,
  "status": {
    "name": "email-sender",
    "state": "active",
    "version": "1.0.0",
    "health": 95,
    "queue": "emails",
    "concurrency": 5,
    "metrics": {
      "completed": 1234,
      "failed": 12,
      "successRate": 0.99,
      "avgDuration": 1200
    }
  }
}
```

### Health Monitoring

#### Get Health Metrics

```http
GET /api/workers/:name/health
```

#### Start Health Monitoring

```http
POST /api/workers/:name/monitoring/start
```

#### Stop Health Monitoring

```http
POST /api/workers/:name/monitoring/stop
```

#### Get Health History

```http
GET /api/workers/:name/monitoring/history?hours=24
```

#### Resource Monitoring Control

**Stop resource monitoring:**

```http
POST /api/resources/stop
```

Response:

```json
{
  "ok": true,
  "message": "Resource monitoring stopped"
}
```

**Start resource monitoring:**

```http
POST /api/resources/start
```

Response:

```json
{
  "ok": true,
  "message": "Resource monitoring started"
}
```

**Get current resource usage:**

```http
GET /api/resources/current
```

**Get resource history:**

```http
GET /api/resources/history?hours=24
```

**Get resource alerts:**

```http
GET /api/resources/alerts
```

**Get resource trends:**

```http
GET /api/resources/trends
```

### Versioning

#### Register Version

```http
POST /api/workers/:name/versions
Content-Type: application/json

{
  "version": "2.0.0",
  "description": "Added retry logic",
  "processor": "EmailProcessorV2"
}
```

#### List Versions

```http
GET /api/workers/:name/versions
```

#### Activate Version

```http
POST /api/workers/:name/versions/:version/activate
```

### Canary Deployments

#### Start Canary

```http
POST /api/workers/:name/canary/start
Content-Type: application/json

{
  "newVersion": "2.0.0",
  "trafficPercentage": 10,
  "duration": 3600000
}
```

#### Pause Canary

```http
POST /api/workers/:name/canary/pause
```

#### Rollback Canary

```http
POST /api/workers/:name/canary/rollback
```

#### Get Canary Status

```http
GET /api/workers/:name/canary/status
```

## Features

### 1. Health Monitoring

Continuous health monitoring with configurable checks:

```typescript
await WorkerFactory.create({
  name: 'email-sender',
  healthCheck: async () => {
    // Check SMTP connection
    const smtpOk = await checkSMTPConnection();

    // Check database connection
    const dbOk = await checkDatabaseConnection();

    return {
      healthy: smtpOk && dbOk,
      details: { smtp: smtpOk, database: dbOk },
    };
  },
});
```

Health monitoring includes:

- Automatic health checks at intervals
- Health score calculation (0-100)
- Failure detection and alerting
- Historical health tracking

### 2. Worker Failure Behavior

**Workers do NOT automatically restart themselves when they crash or hang.** The system provides:

✅ **Failure Detection**: Health monitoring detects failures through periodic health checks
✅ **Status Tracking**: Failed workers are marked as `FAILED` and remain visible for debugging
✅ **Manual Recovery**: Restart APIs and dashboard controls for manual intervention
✅ **Boot Recovery**: Auto-start on application restart for workers with `autoStart: true`
❌ **No Auto-Restart**: No automatic restart during runtime to prevent cascade failures

This design prioritizes **stability and observability** over automatic recovery, requiring manual intervention for failed workers.

#### What Happens When Workers Fail:

1. **Detection**: HealthMonitor detects consecutive failures (default threshold: 2)
2. **Status Change**: Worker status changes from `RUNNING` to `FAILED`
3. **Logging**: Detailed error information is logged for debugging
4. **No Restart**: Worker remains stopped until manual restart or application reboot

#### Recovery Options:

```bash
# Manual restart via CLI
zin worker:restart my-worker

# Manual restart via HTTP API
POST /api/workers/my-worker/restart

# Dashboard restart
# Use the worker dashboard UI restart button
```

#### Custom Auto-Restart Implementation:

```typescript
// Example: Implement custom auto-restart with health monitoring
HealthMonitor.startMonitoring('my-worker', {
  criticalCallback: async (name: string, result: HealthCheckResult) => {
    Logger.warn(`Worker ${name} failed, attempting restart...`);
    try {
      await WorkerFactory.restart(name);
      Logger.info(`Worker ${name} restarted successfully`);
    } catch (error) {
      Logger.error(`Failed to restart worker ${name}`, error);
      // Implement escalation logic here
    }
  },
});
```

### 3. Auto-Scaling

Automatic scaling based on queue depth and resources:

```typescript
AutoScaler.configure({
  enabled: true,
  minWorkers: 1,
  maxWorkers: 10,
  scaleUpThreshold: 100, // Jobs in queue
  scaleDownThreshold: 10,
  evaluationInterval: 30000, // 30 seconds
});
```

Auto-scaling features:

- Queue-based scaling (scale up when queue grows)
- Resource-based scaling (scale based on CPU/memory)
- Time-based scaling (scale for known peaks)
- Cost-aware scaling (consider cost limits)
- Manual override controls

### 3. Resource Monitoring Control

Control the resource monitor to manage CPU/memory snapshots and logs:

#### Why Control Resource Monitoring?

The Resource Monitor runs by default and captures system snapshots every 30 seconds, which:

- Generates `[DEBUG] Resource snapshot captured` logs continuously
- Tracks CPU and memory usage for cost estimation
- Provides data for resource-based auto-scaling
- Generates alerts when thresholds are exceeded

**When to stop it:**

- During development when logs are distracting
- When you don't need resource tracking
- To reduce monitoring overhead in low-resource environments

**Implications of stopping:**

- ❌ No more periodic snapshot logs
- ❌ Cost estimation disabled
- ❌ Resource alerts disabled (no warnings for high CPU/memory)
- ❌ Resource-based auto-scaling may not work correctly

#### CLI Command

**Stop resource monitoring:**

```bash
# Stop from another terminal while workers are running
zin resource:monitor stop

# Or use the short alias
zin rm stop

# Specify custom port if not using default 7777
zin rm stop --port 8080

# Specify custom host
zin rm stop --host 192.168.1.100
```

**Start resource monitoring:**

```bash
# Start monitoring
zin resource:monitor start

# Or use the short alias
zin rm start

# With custom port/host
zin rm start --port 8080 --host 192.168.1.100
```

**Output:**

```bash
$ zin rm stop
[INFO] Sending stop request to http://127.0.0.1:7777/api/resources/stop...
[INFO] Success: Resource monitoring stopped

$ zin rm start
[INFO] Sending start request to http://127.0.0.1:7777/api/resources/start...
[INFO] Success: Resource monitoring started
```

#### HTTP API

**Stop resource monitoring:**

```http
POST /api/resources/stop
Content-Type: application/json
```

**Response:**

```json
{
  "ok": true,
  "message": "Resource monitoring stopped"
}
```

**Start resource monitoring:**

```http
POST /api/resources/start
Content-Type: application/json
```

**Response:**

```json
{
  "ok": true,
  "message": "Resource monitoring started"
}
```

#### Example Usage

**Scenario: Development Workflow**

```bash
# Terminal 1: Start your worker service
zin start

# You see continuous logs:
# [DEBUG] Resource snapshot captured { cpu: '2.0%', memory: '98.0%' }
# [DEBUG] Resource snapshot captured { cpu: '1.4%', memory: '99.5%' }
# ...

# Terminal 2: Stop the monitoring
zin rm stop

# Terminal 1: Logs stop immediately ✓
```

**Scenario: Production Debugging**

```bash
# Stop monitoring temporarily to reduce log noise
curl -X POST http://localhost:7777/api/resources/stop

# Debug your issues without resource logs

# Re-enable monitoring
curl -X POST http://localhost:7777/api/resources/start
```

**Scenario: Automated Control**

```typescript
import { Logger } from '@zintrust/core';

// Stop monitoring during specific operations
async function performMaintenanceTask() {
  Logger.info('Starting maintenance...');

  // Stop resource monitoring
  await fetch('http://localhost:7777/api/resources/stop', {
    method: 'POST',
  });

  // Perform heavy operations without monitoring overhead
  await runDatabaseMigrations();
  await rebuildIndexes();

  // Resume monitoring
  await fetch('http://localhost:7777/api/resources/start', {
    method: 'POST',
  });

  Logger.info('Maintenance complete');
}
```

#### Best Practices

**Development:**

- ✅ Stop monitoring to reduce log noise
- ✅ Use `--verbose` flag only when needed
- ✅ Configure `LOG_LEVEL=info` in `.env` to hide DEBUG logs

**Staging:**

- ✅ Keep monitoring enabled for realistic testing
- ✅ Monitor resource usage patterns
- ✅ Test auto-scaling behavior

**Production:**

- ✅ Keep monitoring enabled for observability
- ✅ Configure alerts for resource thresholds
- ✅ Use monitoring data for cost optimization
- ❌ Don't stop monitoring unless debugging

#### Configuration

Control monitoring interval in your worker configuration:

```typescript
// config/workers.ts
export const workerConfig = {
  monitoring: {
    resourceMonitoring: {
      enabled: true,
      intervalSeconds: 30, // Snapshot every 30 seconds
      logLevel: 'debug', // Can be 'debug', 'info', or 'none'
    },
  },
};
```

**Disable monitoring on startup:**

```typescript
import { ResourceMonitor } from '@zintrust/workers';

// Don't start monitoring automatically
ResourceMonitor.initialize({ enabled: false });

// Start manually when needed
ResourceMonitor.start(60); // Snapshot every 60 seconds
```

#### Error Handling

**Worker service not running:**

```bash
$ zin rm stop
[ERROR] Failed to stop resource monitor: fetch failed
[INFO] Ensure the worker service is running and the port is correct.
```

**Solution:**

1. Verify workers are running: `zin worker:list`
2. Check port configuration: default is `7777`
3. Verify service is accessible: `curl http://localhost:7777/api/workers`

**Invalid action:**

```bash
$ zin rm pause
[ERROR] Invalid action. Use "start" or "stop".
```

#### Related Commands

- `zin worker:list` - List all workers
- `zin worker:status my-worker` - Check worker health
- `zin start --verbose` - Start with verbose logging
- `zin logs` - View application logs

### 3. Circuit Breakers

Prevent cascading failures with circuit breakers:

```typescript
CircuitBreaker.configure('email-service', {
  failureThreshold: 5,
  resetTimeout: 60000,
  halfOpenAttempts: 3,
});
```

States:

- **Closed**: Normal operation
- **Open**: Blocking requests after threshold
- **Half-Open**: Testing if service recovered

### 4. Dead Letter Queue

Handle failed jobs with retry strategies:

```typescript
DeadLetterQueue.configure({
  maxRetries: 3,
  retryStrategy: 'exponential',
  retryDelay: 60000,
});
```

Features:

- Automatic retry with backoff
- Manual retry controls
- Job anonymization for privacy
- Audit logging for compliance

### 5. Compliance

GDPR, HIPAA, and SOC2 compliance:

```typescript
await ComplianceManager.encryptData('user-data', sensitiveData, {
  gdprConsent: true,
  dataSubject: 'user@example.com',
});

// GDPR right to be forgotten
await ComplianceManager.deleteDataSubject('user@example.com');

// Audit logs
const logs = await ComplianceManager.getAuditLogs('hipaa');
```

### 6. Versioning

Rolling updates with version control:

```typescript
// Register new version
await WorkerVersioning.registerVersion('email-sender', {
  version: '2.0.0',
  description: 'Improved retry logic',
  processor: EmailProcessorV2,
});

// Activate version (rolling update)
await WorkerVersioning.activateVersion('email-sender', '2.0.0');

// Rollback if needed
await WorkerVersioning.activateVersion('email-sender', '1.0.0');
```

### 7. Canary Deployments

Progressive rollout with automatic rollback:

```typescript
// Start canary with 10% traffic
await CanaryController.startCanary('email-sender', {
  newVersion: '2.0.0',
  trafficPercentage: 10,
  duration: 3600000, // 1 hour
  autoRollback: true,
  successThreshold: 95, // Health score
});
```

Canary process:

1. Start with small traffic percentage
2. Monitor health and errors
3. Gradually increase traffic
4. Auto-rollback on failures
5. Complete or abort deployment

### 8. Multi-Datacenter

Cross-region orchestration:

```typescript
// Define datacenter regions
await DatacenterOrchestrator.registerRegion({
  id: 'us-west',
  name: 'US West',
  location: { lat: 37.7749, lon: -122.4194 },
  capacity: 1000,
});

// Place worker in region
await DatacenterOrchestrator.placeWorker('email-sender', 'us-west', {
  priority: 'high',
  affinityRules: ['email-service-us-west'],
});

// Configure failover
await DatacenterOrchestrator.setFailoverPolicy('email-sender', {
  primaryRegion: 'us-west',
  secondaryRegion: 'us-east',
  autoFailover: true,
  healthCheckInterval: 30000,
});
```

### 9. Observability

Comprehensive metrics and tracing:

```typescript
// Prometheus metrics
const metrics = await Observability.getPrometheusMetrics();

// Custom metrics
await Observability.recordCustomMetric('email_delivery_time', 1200, {
  provider: 'smtp',
  template: 'welcome',
});

// Distributed tracing
await Observability.startTrace('email-send', {
  userId: '123',
  emailType: 'welcome',
});
```

Integrations:

- **Prometheus**: Metrics collection
- **OpenTelemetry**: Distributed tracing
- **Datadog**: APM and monitoring
- **Custom sinks**: Send metrics anywhere

### 10. Plugin System

Extend functionality with plugins:

```typescript
await PluginManager.registerPlugin({
  name: 'email-throttle',
  version: '1.0.0',
  author: 'Your Team',
  dependencies: [],

  onJobStart: async (workerName, job) => {
    // Throttle emails per user
    await checkUserEmailLimit(job.data.userId);
  },

  onJobComplete: async (workerName, job, result) => {
    // Track email sends
    await incrementUserEmailCount(job.data.userId);
  },
});

// Enable plugin
await PluginManager.enablePlugin('email-throttle');
```

Plugin hooks:

- onJobStart, onJobComplete, onJobFailed
- onWorkerStart, onWorkerStop
- onHealthCheck
- onScale, onFailover
- And more...

### 6. Security & Validation

Comprehensive input validation and security middleware for all worker API endpoints:

#### **Security Features Implemented:**

**Input Sanitization:**
✅ **Worker Names**: `^[a-zA-Z0-9_-]{3,50}$` pattern with sanitization
✅ **Queue Names**: Same pattern as worker names
✅ **Versions**: Semantic versioning `^\d+\.\d+\.\d+$`
✅ **Processor Paths**: File extension validation + path traversal prevention
✅ **Infrastructure**: Driver validation, persistence config validation
✅ **Features**: Boolean-only validation with allowed feature list
✅ **Datacenter**: Region format validation, topology validation

**Error Handling:**
✅ **Standardized Error Codes**: `INVALID_WORKER_NAME`, `MISSING_REQUIRED_FIELD`, etc.
✅ **Detailed Error Messages**: Clear validation feedback
✅ **Type Safety**: Full TypeScript support with proper typing
✅ **Consistent Response Format**: Standardized JSON error responses

**Middleware Architecture:**
✅ **Composable**: Chain multiple validators together
✅ **Reusable**: Individual validators can be used independently
✅ **Extensible**: Custom validation schemas for any use case
✅ **Performance**: Efficient validation with early returns

#### **Validation Examples:**

**Worker Creation with Full Validation:**

```typescript
POST /api/workers/create
{
  "name": "email-worker",
  "queueName": "emails",
  "version": "1.0.0",
  "processor": "./processors/EmailProcessor.ts",
  "infrastructure": {
    "driver": "redis",
    "persistence": { "driver": "db" }
  },
  "features": {
    "observability": true,
    "healthMonitoring": true
  }
}
```

**Custom Validation Schema:**

```typescript
const schema = {
  page: { type: 'number', min: 1, default: 1 },
  limit: { type: 'number', min: 1, max: 100 },
  status: { type: 'string', allowedValues: ['active', 'inactive'] },
};

Router.get(r, '/workers', withCustomValidation(schema, handler));
```

**Validation Middleware Usage:**

```typescript
// Individual validators
Router.post(r, '/create', withCreateWorkerValidation(controller.create));
Router.post(r, '/:name/start', withWorkerOperationValidation(controller.start));

// Composite validation chains
Router.get(r, '/', withCustomValidation(ValidationSchemas.workerFilter, handler));
```

**Error Response Format:**

```json
{
  "error": "Invalid worker name",
  "message": "Worker name must be 3-50 characters long and contain only letters, numbers, hyphens, and underscores",
  "code": "INVALID_WORKER_NAME"
}
```

## Architecture

### Components

```
┌─────────────────────────────────────────────────────────┐
│                   WorkerFactory                         │
│  (Creates and manages all worker instances)             │
└────────────────────┬────────────────────────────────────┘
                     │
     ┌───────────────┼───────────────┐
     │               │               │
┌────▼─────┐  ┌─────▼──────┐  ┌────▼─────┐
│ Worker 1 │  │  Worker 2  │  │ Worker N │
│ (BullMQ) │  │  (BullMQ)  │  │ (BullMQ) │
└────┬─────┘  └─────┬──────┘  └────┬─────┘
     │              │              │
     └──────────────┼──────────────┘
                    │
┌───────────────────▼──────────────────────────────────────┐
│                  Redis (Queues + Metrics)                │
└──────────────────────────────────────────────────────────┘

Supporting Modules:
├── WorkerRegistry (track all workers)
├── ClusterLock (distributed coordination)
├── WorkerMetrics (collect metrics)
├── HealthMonitor (health checks)
├── AutoScaler (scale decisions)
├── CircuitBreaker (failure protection)
├── DeadLetterQueue (retry failed jobs)
├── ResourceMonitor (system resources)
├── ComplianceManager (GDPR/HIPAA)
├── Observability (metrics/tracing)
├── PluginManager (extensibility)
├── MultiQueueWorker (multi-queue support)
├── WorkerVersioning (version control)
├── CanaryController (canary deploys)
└── DatacenterOrchestrator (multi-DC)
```

### Data Flow

```
1. Job Created
   └─> Added to Redis Queue

2. Worker Pulls Job
   ├─> PluginManager.onJobStart()
   ├─> Processor executes job
   ├─> Metrics recorded
   └─> Health check updated

3. Job Completes
   ├─> PluginManager.onJobComplete()
   ├─> Metrics updated
   └─> Auto-scaler evaluates

4. Job Fails
   ├─> Circuit breaker increments failures
   ├─> DLQ handles retry
   └─> Health monitor alerted
```

## Examples

### Basic Email Worker

```typescript
import { WorkerFactory } from '@zintrust/workers';
import { Job } from 'bullmq';
import { sendEmail } from '@app/Services/EmailService';

export async function createEmailWorker() {
  await WorkerFactory.create({
    name: 'email-sender',
    queueName: 'emails',
    concurrency: 5,

    processor: async (job: Job) => {
      const { to, subject, body, template } = job.data;

      const result = await sendEmail({
        to,
        subject,
        body,
        template,
      });

      return {
        messageId: result.messageId,
        sentAt: new Date(),
      };
    },

    healthCheck: async () => {
      try {
        await checkEmailServiceConnection();
        return { healthy: true };
      } catch (error) {
        return { healthy: false, error: error.message };
      }
    },
  });
}
```

### PDF Generation Worker with Retry

```typescript
await WorkerFactory.create({
  name: 'pdf-generator',
  queueName: 'documents',
  concurrency: 3,

  processor: async (job: Job) => {
    const { template, data, userId } = job.data;

    try {
      const pdf = await generatePDF(template, data);
      const url = await uploadToStorage(pdf, `${userId}/${job.id}.pdf`);

      return { url, size: pdf.length };
    } catch (error) {
      // Will retry automatically
      throw error;
    }
  },

  // Retry configuration
  jobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
  },
});
```

### Worker with Multi-Queue Support

```typescript
await MultiQueueWorker.create({
  name: 'multi-processor',
  queues: [
    { name: 'high-priority', weight: 10 },
    { name: 'normal', weight: 5 },
    { name: 'low-priority', weight: 1 },
  ],
  concurrency: 10,

  processor: async (job: Job, queueName: string) => {
    Logger.info(`Processing job from ${queueName}`);
    // Process job based on queue
    return await processJob(job, queueName);
  },
});
```

### Worker with Canary Deployment

```typescript
// 1. Register new version
await WorkerVersioning.registerVersion('api-processor', {
  version: '2.0.0',
  description: 'New API endpoints',
  processor: ApiProcessorV2,
  healthCheck: apiHealthCheckV2,
});

// 2. Start canary with 10% traffic
await CanaryController.startCanary('api-processor', {
  newVersion: '2.0.0',
  trafficPercentage: 10,
  duration: 3600000, // 1 hour
  autoRollback: true,
  successThreshold: 95,
  rollbackThreshold: 80,
});

// 3. Monitor canary status
const status = await CanaryController.getCanaryStatus('api-processor');
Logger.info(`Canary health: ${status.health}/100`);
Logger.info(`Traffic split: ${status.trafficPercentage}%`);

// 4. Complete or rollback
if (status.health > 95) {
  await CanaryController.completeCanary('api-processor');
} else {
  await CanaryController.rollbackCanary('api-processor');
}
```

## Troubleshooting

### Worker Crashed or Hung - Not Auto-Restarting

**Symptoms**: Worker status shows "FAILED" and doesn't restart automatically

**Expected Behavior**: This is normal. Workers do NOT automatically restart themselves when they crash or hang.

**Why This Happens**: The system prioritizes stability and observability over automatic recovery to prevent cascade failures.

**Solutions**:

1. **Manual Restart**:

   ```bash
   # CLI
   zin worker:restart my-worker

   # HTTP API
   POST /api/workers/my-worker/restart

   # Dashboard
   # Click restart button in worker UI
   ```

2. **Check Health Status**:

   ```bash
   # Check worker health
   zin worker:status my-worker

   # View health history
   curl "http://localhost:7777/api/workers/my-worker/monitoring/history"
   ```

3. **Investigate Failure**:

   ```bash
   # Check logs for error details
   tail -f storage/logs/zintrust.log | grep "my-worker"

   # View worker metrics
   curl "http://localhost:7777/api/workers/my-worker/metrics"
   ```

4. **Implement Custom Auto-Restart** (if needed):

   ```typescript
   // Add to your worker initialization
   HealthMonitor.startMonitoring('my-worker', {
     criticalCallback: async (name: string, result: HealthCheckResult) => {
       Logger.warn(`Worker ${name} failed, attempting restart...`);
       try {
         await WorkerFactory.restart(name);
         Logger.info(`Worker ${name} restarted successfully`);
       } catch (error) {
         Logger.error(`Failed to restart worker ${name}`, error);
         // Implement escalation logic (alerts, notifications, etc.)
       }
     },
   });
   ```

5. **Use External Process Managers** (for production):
   - **PM2**: Configure auto-restart policies
   - **Docker**: Set restart policies (`--restart=unless-stopped`)
   - **Kubernetes**: Configure liveness probes and restart policies
   - **Systemd**: Set service restart on failure

### Worker Not Starting

**Symptoms**: Worker status shows "stopped" after start command

**Solutions**:

1. Check Redis connection:

   ```bash
   redis-cli ping
   ```

2. Verify worker configuration in `routes/workers.ts`

3. Check logs:

   ```bash
   tail -f storage/logs/zintrust.log
   ```

4. Verify queue exists:
   ```bash
   redis-cli keys "bull:*"
   ```

### Worker list fails with DB persistence

**Symptoms**: `worker:list` reports the database connection is not registered.

**Solutions**:

1. Confirm the connection exists in `config/database.ts` (for example `mysql`, `postgresql`, `sqlite`).
2. Ensure your environment variables match that connection (for example `DB_CONNECTION=mysql`).
3. If you register connections manually in app startup, call `useDatabase(config, 'mysql')` before running worker commands.

### High Memory Usage

**Symptoms**: Worker consuming excessive memory

**Solutions**:

1. Reduce concurrency:

   ```typescript
   await WorkerFactory.update('worker-name', { concurrency: 1 });
   ```

2. Enable resource monitoring:

   ```typescript
   ResourceMonitor.startMonitoring(30000);
   ```

3. Check for memory leaks in processor

4. Enable auto-scaling to distribute load

### Jobs Failing Repeatedly

**Symptoms**: Jobs moving to dead letter queue

**Solutions**:

1. Check circuit breaker status:

   ```http
   GET /api/workers/:name/circuit-breaker/state
   ```

2. Review DLQ:

   ```http
   GET /api/workers/:name/dead-letter-queue/list
   ```

3. Retry failed jobs:

   ```http
   POST /api/workers/:name/dead-letter-queue/retry
   ```

4. Check external service dependencies

### Poor Health Scores

**Symptoms**: Health scores below 80

**Solutions**:

1. Review health check implementation
2. Increase health check interval
3. Check resource usage (CPU/memory)
4. Review error rates in metrics
5. Check circuit breaker failures

### Auto-Scaling Not Working

**Symptoms**: Workers not scaling despite queue growth

**Solutions**:

1. Verify auto-scaling enabled:

   ```typescript
   AutoScaler.getConfig(); // Check config
   ```

2. Check scaling thresholds:

   ```typescript
   AutoScaler.configure({
     scaleUpThreshold: 50, // Lower threshold
     scaleDownThreshold: 5,
   });
   ```

3. Review resource limits (maxWorkers)

4. Check evaluation interval

### Too Many Resource Logs

**Symptoms**: Continuous `[DEBUG] Resource snapshot captured` logs flooding console

**Solutions:**

1. **Stop resource monitoring (recommended for development):**

   ```bash
   zin rm stop
   ```

2. **Change log level in `.env`:**

   ```bash
   LOG_LEVEL=info  # Hide DEBUG logs
   ```

3. **Adjust monitoring interval:**

   ```typescript
   ResourceMonitor.start(120); // Snapshot every 2 minutes instead of 30s
   ```

4. **Disable monitoring in config:**
   ```typescript
   // config/workers.ts
   monitoring: {
     resourceMonitoring: {
       enabled: false;
     }
   }
   ```

**Best Practice:**

- Use `zin rm stop` during development
- Keep enabled in staging/production for observability
- Use log level `info` or higher to hide debug logs

## Support

For more help:

- Check the [API Reference](./worker-api-reference.md)
- Review [Architecture Documentation](./worker-architecture.md)
- See [Migration Guide](./worker-migration.md)
- Open an issue on GitHub
