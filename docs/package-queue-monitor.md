---
title: Queue Monitor
description: Queue monitoring and management for ZinTrust's queue system
---

# Queue Monitor

The `@zintrust/queue-monitor` package provides comprehensive monitoring and management capabilities for ZinTrust's queue system, enabling real-time queue insights and administration.

## Installation

```bash
zin add  @zintrust/queue-monitor
```

## Configuration

Add the queue monitor configuration to your environment:

```typescript
// config/queue.ts
import { QueueConfig } from '@zintrust/core/config';

export const queue: QueueConfig = {
  driver: 'redis', // or other queue driver
  monitor: {
    enabled: true,
    interval: 30000, // Monitoring interval in ms
    retention: 7 * 24 * 60 * 60 * 1000, // 7 days retention
    alerts: {
      queueSize: 1000, // Alert when queue size exceeds
      processingTime: 30000, // Alert when processing time exceeds
      failureRate: 0.05, // Alert when failure rate exceeds 5%
    },
  },
};
```

## Usage

```typescript
import { Queue } from '@zintrust/core/tools/queue';
import { QueueMonitor } from '@zintrust/queue-monitor';

// Basic queue monitoring
const stats = await QueueMonitor.getStats();
console.log('Queue statistics:', stats);

// Monitor specific queue
const queueStats = await QueueMonitor.getQueueStats('email-queue');
console.log('Email queue stats:', queueStats);

// Get active jobs
const activeJobs = await QueueMonitor.getActiveJobs();
console.log('Active jobs:', activeJobs);

// Get failed jobs
const failedJobs = await QueueMonitor.getFailedJobs();
console.log('Failed jobs:', failedJobs);
```

## Features

- **Real-time Monitoring**: Live queue statistics and metrics
- **Job Tracking**: Track job status and progress
- **Performance Metrics**: Processing time, throughput, and latency
- **Alert System**: Configurable alerts for queue conditions
- **Historical Data**: Retention of historical queue data
- **Dashboard**: Built-in monitoring dashboard
- **API Endpoints**: REST API for monitoring data
- **Webhook Support**: Webhook notifications for events

## Monitoring Metrics

### Queue Statistics

```typescript
const stats = await QueueMonitor.getStats();
// Returns:
{
  totalQueues: 5,
  totalJobs: 10000,
  activeJobs: 25,
  completedJobs: 9500,
  failedJobs: 75,
  averageProcessingTime: 2500, // ms
  throughput: 10, // jobs per second
  queues: {
    'email-queue': {
      size: 100,
      active: 5,
      completed: 2000,
      failed: 10,
      averageProcessingTime: 1500,
    },
    // ... other queues
  }
}
```

### Job Details

```typescript
const jobDetails = await QueueMonitor.getJobDetails('job-id');
// Returns:
{
  id: 'job-id',
  queue: 'email-queue',
  status: 'processing', // waiting, processing, completed, failed
  payload: { /* job data */ },
  attempts: 1,
  maxAttempts: 3,
  createdAt: '2024-01-01T00:00:00Z',
  startedAt: '2024-01-01T00:01:00Z',
  completedAt: null,
  failedAt: null,
  error: null,
  processingTime: 5000, // ms
}
```

## Advanced Configuration

### Custom Alerts

```typescript
export const queue: QueueConfig = {
  driver: 'redis',
  monitor: {
    enabled: true,
    alerts: {
      queueSize: {
        threshold: 1000,
        action: 'webhook',
        webhook: 'https://your-webhook.com/alerts',
      },
      processingTime: {
        threshold: 30000,
        action: 'email',
        recipients: ['admin@example.com'],
      },
      failureRate: {
        threshold: 0.05,
        action: 'slack',
        webhook: 'https://hooks.slack.com/your-webhook',
      },
    },
  },
};
```

### Custom Metrics

```typescript
// Add custom metrics tracking
QueueMonitor.addMetric('custom-business-metric', async () => {
  const value = await calculateBusinessMetric();
  return value;
});

// Get custom metrics
const customMetrics = await QueueMonitor.getCustomMetrics();
```

## Dashboard Integration

### Built-in Dashboard

```typescript
import { QueueMonitorDashboard } from '@zintrust/queue-monitor/dashboard';

// Enable dashboard
const dashboard = new QueueMonitorDashboard({
  port: 3001,
  auth: {
    username: 'admin',
    password: 'password',
  },
  refreshInterval: 5000,
});

// Start dashboard server
await dashboard.start();
```

### Custom Dashboard

```typescript
// Get data for custom dashboard
const dashboardData = await QueueMonitor.getDashboardData();
// Returns comprehensive data for dashboard rendering
```

## API Endpoints

### REST API

The queue monitor provides REST API endpoints for monitoring:

```typescript
// GET /api/queue/stats
const stats = await fetch('/api/queue/stats').then((r) => r.json());

// GET /api/queue/:name/stats
const queueStats = await fetch('/api/queue/email-queue/stats').then((r) => r.json());

// GET /api/jobs/active
const activeJobs = await fetch('/api/jobs/active').then((r) => r.json());

// GET /api/jobs/failed
const failedJobs = await fetch('/api/jobs/failed').then((r) => r.json());

// GET /api/jobs/:id
const jobDetails = await fetch('/api/jobs/job-id').then((r) => r.json());
```

### GraphQL API

```typescript
import { QueueMonitorGraphQL } from '@zintrust/queue-monitor';

const graphql = new QueueMonitorGraphQL();

// Query queue statistics
const query = `
  query {
    queueStats {
      totalQueues
      totalJobs
      activeJobs
      completedJobs
      failedJobs
      queues {
        name
        size
        active
        completed
        failed
      }
    }
  }
`;

const result = await graphql.query(query);
```

## Job Management

### Retry Failed Jobs

```typescript
// Retry specific failed job
await QueueMonitor.retryJob('job-id');

// Retry all failed jobs in a queue
await QueueMonitor.retryFailedJobs('email-queue');

// Retry failed jobs with conditions
await QueueMonitor.retryFailedJobs('email-queue', {
  olderThan: '1 hour',
  maxAttempts: 3,
});
```

### Cancel Jobs

```typescript
// Cancel active job
await QueueMonitor.cancelJob('job-id');

// Cancel all jobs in queue
await QueueMonitor.cancelQueueJobs('email-queue');

// Cancel jobs with conditions
await QueueMonitor.cancelJobs('email-queue', {
  status: 'waiting',
  olderThan: '30 minutes',
});
```

### Purge Jobs

```typescript
// Purge completed jobs
await QueueMonitor.purgeCompletedJobs('email-queue');

// Purge failed jobs
await QueueMonitor.purgeFailedJobs('email-queue');

// Purge all jobs
await QueueMonitor.purgeQueue('email-queue');

// Purge with conditions
await QueueMonitor.purgeJobs('email-queue', {
  status: 'completed',
  olderThan: '7 days',
});
```

## Performance Monitoring

### Performance Metrics

```typescript
const performance = await QueueMonitor.getPerformanceMetrics();
// Returns:
{
  throughput: {
    jobsPerSecond: 10.5,
    jobsPerMinute: 630,
    jobsPerHour: 37800,
  },
  latency: {
    average: 2500,
    median: 2000,
    p95: 5000,
    p99: 8000,
  },
  errors: {
    rate: 0.02,
    total: 200,
    byType: {
      'timeout': 50,
      'connection': 30,
      'business': 120,
    },
  },
}
```

### Benchmarking

```typescript
// Run performance benchmark
const benchmark = await QueueMonitor.runBenchmark({
  duration: 60000, // 1 minute
  concurrency: 10,
  jobSize: 1024, // bytes
});

console.log('Benchmark results:', benchmark);
```

## Webhook Integration

### Event Webhooks

```typescript
export const queue: QueueConfig = {
  driver: 'redis',
  monitor: {
    webhooks: {
      'job.completed': 'https://your-app.com/webhooks/job-completed',
      'job.failed': 'https://your-app.com/webhooks/job-failed',
      'queue.alert': 'https://your-app.com/webhooks/queue-alert',
    },
    webhookSecret: 'your-webhook-secret',
  },
};
```

### Webhook Payload

```typescript
// Example webhook payload for job completion
{
  event: 'job.completed',
  timestamp: '2024-01-01T00:00:00Z',
  data: {
    jobId: 'job-id',
    queue: 'email-queue',
    status: 'completed',
    processingTime: 2500,
    attempts: 1,
  },
}
```

## Error Handling

The queue monitor handles:

- Connection errors to queue systems
- Metric collection failures
- Alert delivery failures
- Dashboard rendering errors
- API endpoint errors

```typescript
try {
  const stats = await QueueMonitor.getStats();
} catch (error) {
  if (error.code === 'QUEUE_CONNECTION_ERROR') {
    console.log('Cannot connect to queue system');
  } else if (error.code === 'METRIC_COLLECTION_ERROR') {
    console.log('Failed to collect metrics');
  } else {
    console.log('Monitor error:', error.message);
  }
}
```

## Security

### Authentication

```typescript
export const queue: QueueConfig = {
  driver: 'redis',
  monitor: {
    auth: {
      type: 'basic',
      username: 'monitor-user',
      password: 'secure-password',
    },
  },
};
```

### API Keys

```typescript
export const queue: QueueConfig = {
  driver: 'redis',
  monitor: {
    apiKeys: {
      'monitor-key-1': {
        permissions: ['read'],
        queues: ['email-queue', 'notification-queue'],
      },
      'admin-key-1': {
        permissions: ['read', 'write', 'admin'],
        queues: ['*'],
      },
    },
  },
};
```

## Testing

### Mock Monitor

```typescript
import { QueueMonitorMock } from '@zintrust/queue-monitor';

// Use mock for testing
const mockMonitor = new QueueMonitorMock();

// Set mock data
mockMonitor.setStats({
  totalQueues: 2,
  totalJobs: 100,
  activeJobs: 5,
  completedJobs: 90,
  failedJobs: 5,
});

// Get mock stats
const stats = await mockMonitor.getStats();
```

## Performance Tips

1. **Monitoring Interval**: Adjust monitoring frequency based on needs
2. **Data Retention**: Configure appropriate retention periods
3. **Alert Thresholds**: Set appropriate alert thresholds
4. **API Caching**: Cache API responses for better performance
5. **Dashboard Optimization**: Optimize dashboard queries

## Limitations

- **Queue Driver Support**: Limited to supported queue drivers
- **Historical Data**: Limited by retention configuration
- **Real-time Updates**: Slight delay in real-time updates
- **API Rate Limits**: May be limited by queue system API limits
