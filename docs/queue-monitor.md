# Queue Monitor

The `@zintrust/queue-monitor` package provides a robust monitoring dashboard and metric collection system for your background jobs, powered by BullMQ and Redis.

## Installation

```bash
zin add @zintrust/queue-monitor
```

## Configuration

Register the monitor in your application (e.g., in `src/index.ts` or a dedicated provider). You must provide a Redis configuration.

```typescript
import { Router } from '@zintrust/core';
import { QueueMonitor } from '@zintrust/queue-monitor';

// Create the monitor instance
const monitor = QueueMonitor.create({
  enabled: true, // defaults to true
  basePath: '/queue-monitor', // defaults to /queue-monitor
  middleware: ['auth'], // Protect your dashboard!
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
  },
});

// Register routes
export const registerRoutes = (router: any) => {
  monitor.registerRoutes(router);
};

// Access the driver or metrics if needed
export const queueDriver = monitor.driver;
```

## Workers

To process jobs and track metrics, use `createQueueWorker`.

```typescript
import { createQueueWorker, type JobPayload } from '@zintrust/queue-monitor';

// Define a processor
const processor = async (job: { data: JobPayload }) => {
  console.log('Processing', job.data);
  // Do work...
};

// Start worker
const worker = createQueueWorker(
  processor,
  { host: 'localhost', port: 6379 },
  monitor.metrics // Pass metrics instance to track stats
);
```

## Dashboard

Navigate to `/queue-monitor` (or your configured path) to see the dashboard.
It provides real-time insights into:

- Throughput (completed/failed jobs)
- Queue depths
- Recent job details
- Failure reasons
