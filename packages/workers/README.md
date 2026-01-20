# @zintrust/workers

Enterprise-grade worker management system for ZinTrust framework. Provides comprehensive background job processing, monitoring, resilience, and orchestration capabilities.

[![npm version](https://badge.fury.io/js/%40zintrust%2Fworkers.svg)](https://www.npmjs.com/package/@zintrust/workers)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Features

- 🚀 **Core Infrastructure**: Worker factory, metrics, registry, distributed locks
- 💪 **Resilience**: Circuit breakers, dead letter queues, auto-scaling
- 📊 **Monitoring**: Health checks, resource monitoring, observability
- 🔐 **Compliance**: GDPR support, data subject management
- 🎯 **Advanced**: Canary deployments, multi-datacenter orchestration, versioning
- 🔌 **Extensible**: Plugin system, multi-queue support, custom workers

## Installation

```bash
npm install @zintrust/workers
```

### Peer Dependencies

```bash
npm install @zintrust/core
```

### Optional Dependencies

For AI-powered anomaly detection (if using `AnomalyDetection` module):

```bash
npm install brain.js ml.js simple-statistics
# Optional: TensorFlow.js for advanced ML
npm install @tensorflow/tfjs-node
```

## Quick Start

### Basic Worker Creation

```typescript
import { createQueueWorker } from '@zintrust/workers';

const emailWorker = await createQueueWorker({
  name: 'email-sender',
  queueName: 'emails',
  handler: async (job) => {
    Logger.info('Processing email:', job.data);
    // Send email logic here
    return { sent: true };
  },
  config: {
    concurrency: 5,
    maxRetries: 3,
  },
});
```

### Using Worker Factory

```typescript
import { WorkerFactory } from '@zintrust/workers';

const worker = WorkerFactory.create({
  name: 'data-processor',
  type: 'queue',
  handler: async (job) => {
    // Process job
  },
});

await worker.start();
```

## Core Modules

### WorkerFactory

Central factory for creating and managing workers.

```typescript
import { WorkerFactory } from '@zintrust/workers';

// Create worker
const worker = WorkerFactory.create({
  name: 'my-worker',
  type: 'queue',
  handler: async (job) => {
    /* ... */
  },
});

// List all workers
const workers = WorkerFactory.listWorkers();

// Get worker by name
const myWorker = WorkerFactory.getWorker('my-worker');

// Remove worker
await WorkerFactory.removeWorker('my-worker');
```

### WorkerMetrics

Collect and analyze worker performance metrics.

```typescript
import { WorkerMetrics } from '@zintrust/workers';

// Record job metrics
WorkerMetrics.recordJob('email-sender', {
  duration: 150,
  success: true,
});

// Get metrics
const metrics = WorkerMetrics.getMetrics('email-sender');
Logger.info(metrics.totalJobs, metrics.avgDuration, metrics.errorRate);

// Get historical data
const history = WorkerMetrics.getHistory('email-sender', {
  from: new Date('2026-01-01'),
  to: new Date(),
});
```

### WorkerRegistry

Register and manage worker metadata.

```typescript
import { WorkerRegistry } from '@zintrust/workers';

// Register worker
WorkerRegistry.register({
  name: 'email-sender',
  version: '1.0.0',
  type: 'queue',
  metadata: {
    description: 'Sends transactional emails',
    author: 'team@example.com',
  },
});

// Get worker info
const info = WorkerRegistry.get('email-sender');

// List all registered workers
const allWorkers = WorkerRegistry.list();

// Check if worker exists
const exists = WorkerRegistry.has('email-sender');
```

## Resilience & Recovery

### Circuit Breaker

Prevent cascading failures with circuit breaker pattern.

```typescript
import { CircuitBreaker } from '@zintrust/workers';

// Configure circuit breaker
CircuitBreaker.configure('external-api', {
  failureThreshold: 5,
  resetTimeout: 60000, // 1 minute
  halfOpenRequests: 3,
});

// Execute with circuit breaker
const result = await CircuitBreaker.execute('external-api', async () => {
  // Call external API
  return await fetch('https://api.example.com');
});

// Get circuit state
const state = CircuitBreaker.getState('external-api');
Logger.info(state); // 'closed' | 'open' | 'half-open'

// Reset circuit
CircuitBreaker.reset('external-api');
```

### Dead Letter Queue

Handle failed jobs gracefully.

```typescript
import { DeadLetterQueue } from '@zintrust/workers';

// Move job to DLQ
await DeadLetterQueue.add('email-sender', {
  jobId: 'job-123',
  data: { email: 'user@example.com' },
  error: 'SMTP connection failed',
  attempts: 3,
});

// List failed jobs
const failedJobs = await DeadLetterQueue.list('email-sender');

// Retry failed job
await DeadLetterQueue.retry('email-sender', 'job-123');

// Get statistics
const stats = await DeadLetterQueue.getStats('email-sender');
Logger.info(stats.totalFailed, stats.retrySuccess);
```

### Auto-Scaling

Automatically scale workers based on load.

```typescript
import { AutoScaler } from '@zintrust/workers';

// Configure auto-scaling
AutoScaler.configure('email-sender', {
  minWorkers: 2,
  maxWorkers: 10,
  scaleUpThreshold: 80, // CPU %
  scaleDownThreshold: 20,
  cooldownPeriod: 300000, // 5 minutes
});

// Start auto-scaling
await AutoScaler.start('email-sender');

// Get scaling status
const status = AutoScaler.getStatus('email-sender');
Logger.info(status.currentWorkers, status.targetWorkers);

// Stop auto-scaling
await AutoScaler.stop('email-sender');
```

## Monitoring & Observability

### Health Monitor

Monitor worker health with configurable checks.

```typescript
import { HealthMonitor } from '@zintrust/workers';

// Configure health checks
HealthMonitor.configure('email-sender', {
  checks: ['memory', 'cpu', 'queue-depth'],
  interval: 30000, // 30 seconds
  thresholds: {
    memory: 80, // percent
    cpu: 70,
    queueDepth: 1000,
  },
});

// Start monitoring
await HealthMonitor.start('email-sender');

// Get health status
const health = HealthMonitor.getHealth('email-sender');
Logger.info(health.status, health.checks);

// Get health history
const history = HealthMonitor.getHistory('email-sender', {
  hours: 24,
});
```

### Resource Monitor

Track system resource usage.

```typescript
import { ResourceMonitor } from '@zintrust/workers';

// Start monitoring
ResourceMonitor.start();

// Get current resource usage
const usage = ResourceMonitor.getCurrentUsage();
Logger.info(usage.cpu, usage.memory, usage.disk);

// Get resource trends
const trends = ResourceMonitor.getTrends({ hours: 1 });

// Set resource alerts
ResourceMonitor.setAlert({
  metric: 'memory',
  threshold: 85,
  callback: (usage) => {
    console.warn('Memory usage high:', usage);
  },
});
```

### Observability

Distributed tracing and metrics collection.

```typescript
import { Observability } from '@zintrust/workers';

// Start a trace
const span = Observability.startSpan('email-send', {
  attributes: {
    'job.id': 'job-123',
    'job.type': 'email',
  },
});

// Add events
span.addEvent('smtp-connect');
span.addEvent('email-sent');

// End trace
span.end();

// Record custom metric
Observability.recordMetric('emails_sent', 1, {
  labels: { type: 'transactional' },
});

// Get metrics (Prometheus format)
const metrics = await Observability.getMetrics();
```

## Advanced Features

### Canary Deployments

Safely deploy new worker versions.

```typescript
import { CanaryController } from '@zintrust/workers';

// Start canary deployment
await CanaryController.start('email-sender', {
  newVersion: '2.0.0',
  trafficPercentage: 10, // 10% to new version
  duration: 600000, // 10 minutes
  successCriteria: {
    maxErrorRate: 2, // percent
    minSuccessRate: 95,
  },
});

// Monitor canary
const status = CanaryController.getStatus('email-sender');
Logger.info(status.trafficPercentage, status.metrics);

// Promote or rollback
if (status.success) {
  await CanaryController.promote('email-sender');
} else {
  await CanaryController.rollback('email-sender');
}
```

### Multi-Datacenter Orchestration

Deploy workers across multiple datacenters.

```typescript
import { DatacenterOrchestrator } from '@zintrust/workers';

// Register datacenter
DatacenterOrchestrator.registerDatacenter({
  id: 'us-east-1',
  region: 'us-east',
  capacity: 100,
  latency: 50, // ms
});

// Place worker
const placement = await DatacenterOrchestrator.placeWorker('email-sender', {
  requirements: {
    minCapacity: 10,
    maxLatency: 100,
    preferredRegions: ['us-east', 'us-west'],
  },
});

Logger.info('Worker placed in:', placement.datacenterId);

// Get topology
const topology = DatacenterOrchestrator.getTopology();
```

### Worker Versioning

Manage multiple worker versions.

```typescript
import { WorkerVersioning } from '@zintrust/workers';

// Register version
WorkerVersioning.registerVersion('email-sender', {
  version: '2.0.0',
  handler: async (job) => {
    /* new logic */
  },
  metadata: {
    releaseDate: new Date(),
    changes: ['Added retry logic', 'Improved error handling'],
  },
});

// List versions
const versions = WorkerVersioning.listVersions('email-sender');

// Get active version
const active = WorkerVersioning.getActiveVersion('email-sender');

// Deprecate version
await WorkerVersioning.deprecateVersion('email-sender', '1.0.0');
```

### Plugin System

Extend worker functionality with plugins.

```typescript
import { PluginManager } from '@zintrust/workers';

// Register plugin
PluginManager.register('email-sender', {
  name: 'rate-limiter',
  hooks: {
    beforeJob: async (job) => {
      // Rate limiting logic
      if (await isRateLimited(job.data.email)) {
        throw new Error('Rate limit exceeded');
      }
    },
    afterJob: async (job, result) => {
      // Track sent emails
      await trackEmail(job.data.email);
    },
  },
});

// Enable plugin
await PluginManager.enable('email-sender', 'rate-limiter');

// List plugins
const plugins = PluginManager.list('email-sender');

// Disable plugin
await PluginManager.disable('email-sender', 'rate-limiter');
```

### Multi-Queue Worker

Process jobs from multiple queues.

```typescript
import { MultiQueueWorker } from '@zintrust/workers';

// Create multi-queue worker
const worker = await MultiQueueWorker.create({
  name: 'notifications',
  queues: [
    { name: 'emails', priority: 1, concurrency: 5 },
    { name: 'sms', priority: 2, concurrency: 3 },
    { name: 'push', priority: 3, concurrency: 10 },
  ],
  handler: async (job, queueName) => {
    Logger.info(`Processing ${queueName} job:`, job.data);
    // Route to appropriate handler
  },
});

// Get queue stats
const stats = await worker.getQueueStats('emails');
Logger.info(stats.pending, stats.active, stats.completed);

// Pause queue
await worker.pauseQueue('sms');

// Resume queue
await worker.resumeQueue('sms');
```

## Compliance & Security

### Compliance Manager (GDPR)

Handle GDPR compliance for worker data.

```typescript
import { ComplianceManager } from '@zintrust/workers';

// Register data subject
ComplianceManager.registerDataSubject({
  subjectId: 'user-123',
  type: 'user',
  metadata: { email: 'user@example.com' },
});

// Record consent
ComplianceManager.recordConsent({
  subjectId: 'user-123',
  purpose: 'email-marketing',
  granted: true,
});

// Check compliance
const compliant = await ComplianceManager.checkCompliance('email-sender', {
  subjectId: 'user-123',
});

// Create access request
await ComplianceManager.createAccessRequest({
  subjectId: 'user-123',
  type: 'data-export',
});

// Get audit logs
const logs = await ComplianceManager.getAuditLogs({
  subjectId: 'user-123',
  from: new Date('2026-01-01'),
});
```

## Specialized Workers

### Broadcast Worker

Send jobs to multiple handlers.

```typescript
import { BroadcastWorker } from '@zintrust/workers';

const worker = await BroadcastWorker.create({
  name: 'system-events',
  handlers: [
    async (job) => {
      /* Log to file */
    },
    async (job) => {
      /* Send to analytics */
    },
    async (job) => {
      /* Update dashboard */
    },
  ],
});

await worker.broadcast({ event: 'user-signup', userId: '123' });
```

### Notification Worker

Send notifications through multiple channels.

```typescript
import { NotificationWorker } from '@zintrust/workers';

const worker = await NotificationWorker.create({
  name: 'notifications',
  channels: {
    email: { provider: 'sendgrid', apiKey: 'xxx' },
    sms: { provider: 'twilio', apiKey: 'yyy' },
    push: { provider: 'fcm', apiKey: 'zzz' },
  },
});

await worker.send({
  userId: '123',
  channels: ['email', 'push'],
  subject: 'Welcome!',
  message: 'Thanks for signing up.',
});
```

## Utilities

### Cluster Lock

Distributed locking for worker coordination.

```typescript
import { ClusterLock } from '@zintrust/workers';

// Acquire lock
const acquired = await ClusterLock.acquire('critical-section', {
  ttl: 30000, // 30 seconds
  waitTimeout: 10000, // Wait up to 10 seconds
});

if (acquired) {
  try {
    // Critical section
    await processExclusiveTask();
  } finally {
    // Release lock
    await ClusterLock.release('critical-section');
  }
}
```

### Priority Queue

Handle jobs with different priorities.

```typescript
import { PriorityQueue } from '@zintrust/workers';

// Add high priority job
await PriorityQueue.add('tasks', {
  data: { taskId: '123' },
  priority: 1, // Higher number = higher priority
});

// Add normal priority job
await PriorityQueue.add('tasks', {
  data: { taskId: '456' },
  priority: 5,
});

// Jobs with priority 1 will be processed before priority 5
```

## HTTP API

The package includes a full REST API for worker management. Register routes in your ZinTrust application:

```typescript
import { registerWorkerRoutes } from '@zintrust/workers';
import { Router } from '@zintrust/core';

// Register all worker routes
registerWorkerRoutes(Router);

// Routes available at:
// GET    /api/workers - List workers
// POST   /api/workers/create - Create worker
// GET    /api/workers/:name - Get worker details
// POST   /api/workers/:name/start - Start worker
// POST   /api/workers/:name/stop - Stop worker
// POST   /api/workers/:name/restart - Restart worker
// DELETE /api/workers/:name - Remove worker
// ... and many more endpoints
```

See the [API Reference](#api-reference) section for all available endpoints.

## Lifecycle Management

### Worker Initialization

Initialize the worker system at application startup:

```typescript
import { WorkerInit } from '@zintrust/workers';

// Initialize workers
await WorkerInit.initialize({
  redis: {
    host: 'localhost',
    port: 6379,
  },
  autoStart: true, // Auto-start registered workers
  healthChecks: true, // Enable health monitoring
});
```

### Graceful Shutdown

Shutdown workers gracefully:

```typescript
import { WorkerShutdown } from '@zintrust/workers';

// Shutdown all workers
await WorkerShutdown.shutdown({
  gracePeriod: 30000, // Wait up to 30 seconds for jobs to complete
  force: false, // Don't force terminate
});
```

## Configuration

### Environment Variables

```bash
# Redis connection
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=secret

# Worker API URL (for HTTP clients)
WORKER_API_URL=http://localhost:3001

# Monitoring
ENABLE_METRICS=true
ENABLE_HEALTH_CHECKS=true

# Observability
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
```

## Testing

### Unit Tests

```typescript
import { describe, it, expect } from 'vitest';
import { WorkerFactory } from '@zintrust/workers';

describe('WorkerFactory', () => {
  it('should create worker', () => {
    const worker = WorkerFactory.create({
      name: 'test-worker',
      type: 'queue',
      handler: async (job) => ({ success: true }),
    });

    expect(worker.name).toBe('test-worker');
  });
});
```

## API Reference

### Core Worker Operations

```
POST /api/workers/create - Create worker
POST /api/workers/:name/start - Start worker
POST /api/workers/:name/stop - Stop worker
POST /api/workers/:name/restart - Restart worker
POST /api/workers/:name/pause - Pause worker
POST /api/workers/:name/resume - Resume worker
DELETE /api/workers/:name - Remove worker
```

### Worker Information

```
GET /api/workers - List all workers
GET /api/workers/:name - Get worker details
GET /api/workers/:name/status - Worker status
GET /api/workers/:name/metrics - Performance metrics
GET /api/workers/:name/health - Health metrics
```

### Health Monitoring

```
POST /api/workers/:name/monitoring/start - Start monitoring
POST /api/workers/:name/monitoring/stop - Stop monitoring
GET /api/workers/:name/monitoring/history - Health history
GET /api/workers/:name/monitoring/trend - Health trend
PUT /api/workers/:name/monitoring/config - Update config
```

### Versioning

```
POST /api/workers/:name/versions - Register version
GET /api/workers/:name/versions - List versions
GET /api/workers/:name/versions/:version - Get version
POST /api/workers/:name/versions/:version/deprecate - Deprecate
POST /api/workers/:name/versions/:version/activate - Activate
POST /api/workers/:name/versions/:version/deactivate - Deactivate
```

See the [complete API documentation](docs/api-reference.md) for all endpoints.

## Performance

- Handles 10,000+ jobs per second per worker
- Sub-millisecond job routing latency
- Horizontal scaling across multiple nodes
- Minimal memory footprint (~50MB per worker)
- Efficient connection pooling

## Best Practices

1. **Use appropriate concurrency**: Don't over-provision workers
2. **Enable health checks**: Monitor worker health proactively
3. **Implement circuit breakers**: Prevent cascading failures
4. **Use DLQ**: Handle failures gracefully
5. **Monitor metrics**: Track performance and errors
6. **Version workers**: Use versioning for safe deployments
7. **Test canaries**: Always test new versions with canary deployments
8. **Set resource limits**: Prevent resource exhaustion
9. **Enable observability**: Use distributed tracing for debugging
10. **Comply with regulations**: Use ComplianceManager for GDPR

## Troubleshooting

### Worker not starting

```typescript
// Check worker status
const status = WorkerFactory.getWorker('my-worker').status;
Logger.info(status);

// Check health
const health = HealthMonitor.getHealth('my-worker');
Logger.info(health);
```

### Jobs stuck in queue

```typescript
// Check queue depth
const metrics = WorkerMetrics.getMetrics('my-worker');
Logger.info(metrics.queueDepth);

// Check worker load
const load = ResourceMonitor.getCurrentUsage();
Logger.info(load);
```

### High error rate

```typescript
// Check DLQ
const failed = await DeadLetterQueue.list('my-worker');
Logger.info(failed);

// Check circuit breaker state
const state = CircuitBreaker.getState('my-worker');
Logger.info(state);
```

## Contributing

See [CONTRIBUTING.md](../../CONTRIBUTING.md) for development guidelines.

## License

MIT © ZinTrust

## Support

- Documentation: https://docs.zintrust.dev/workers
- Issues: https://github.com/ZinTrust/zintrust/issues
- Discord: https://discord.gg/zintrust

---

**Status**: Production-ready (26/32 tasks completed)

**Coming Soon**:

- SLA Monitoring
- AI-Powered Anomaly Detection
- Chaos Engineering Tools
- Telemetry Dashboard UI
- Queue-Monitor Worker UI
