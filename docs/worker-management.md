# Worker Management System

Enterprise-grade worker management system for ZinTrust Framework with comprehensive features including health monitoring, auto-scaling, compliance, versioning, canary deployments, and multi-datacenter orchestration.

## Table of Contents

- [Overview](#overview)
- [Quick Start](#quick-start)
- [Core Concepts](#core-concepts)
- [Configuration](#configuration)
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
curl -X POST http://localhost:3000/api/workers \\
  -H "Content-Type: application/json" \\
  -d '{"name": "email-sender", "queueName": "emails", "concurrency": 5}'

# Start a worker
curl -X POST http://localhost:3000/api/workers/email-sender/start

# Get worker status
curl http://localhost:3000/api/workers/email-sender/status

# Get health metrics
curl http://localhost:3000/api/workers/email-sender/health
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

### Core Config (`src/config/workers.ts`)

Type definitions and interfaces for worker configuration.

### Developer Config (`config/workers.ts`)

Runtime configuration for your workers:

```typescript
import { type IWorkerConfig } from '@config/workers';

export const workerConfig: IWorkerConfig = {
  redis: {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: Number(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD,
    db: Number(process.env.REDIS_DB) || 0,
  },
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

### worker:status <name>

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

### worker:start <name>

Start a stopped worker:

```bash
zintrust worker:start email-sender
```

### worker:stop <name>

Stop a running worker gracefully:

```bash
zintrust worker:stop email-sender
```

### worker:restart <name>

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
- Auto-recovery on failures

### 2. Auto-Scaling

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
    console.log(`Processing job from ${queueName}`);
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
console.log(`Canary health: ${status.health}/100`);
console.log(`Traffic split: ${status.trafficPercentage}%`);

// 4. Complete or rollback
if (status.health > 95) {
  await CanaryController.completeCanary('api-processor');
} else {
  await CanaryController.rollbackCanary('api-processor');
}
```

## Troubleshooting

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

## Support

For more help:

- Check the [API Reference](./worker-api-reference.md)
- Review [Architecture Documentation](./worker-architecture.md)
- See [Migration Guide](./worker-migration.md)
- Open an issue on GitHub
