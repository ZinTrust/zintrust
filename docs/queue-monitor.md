# Queue Monitor

The `@zintrust/queue-monitor` package provides a robust monitoring dashboard and metric collection system for your background jobs, powered by BullMQ and Redis.

## Installation

```bash
zin add @zintrust/queue-monitor
```

## When to use

- ✅ Use `@zintrust/queue-monitor` if you need full queue management (enqueue + process + monitor + retry)
- ✅✅ Use `@zintrust/queue-redis` if you only need to **enqueue jobs** and another service will process them

**Note:** The monitor package can do everything queue-redis does, plus much more. So if you install `@zintrust/queue-monitor`, there's no need for `@zintrust/queue-redis`.

## BullMQ Environment Variables

The queue monitor and Redis queue driver use BullMQ with these customizable settings:

| Environment Variable        | Default     | Description                                        | Example |
| --------------------------- | ----------- | -------------------------------------------------- | ------- |
| `BULLMQ_REMOVE_ON_COMPLETE` | 100         | Number of completed jobs to keep in Redis          | 200     |
| `BULLMQ_REMOVE_ON_FAIL`     | 50          | Number of failed jobs to keep in Redis             | 25      |
| `BULLMQ_DEFAULT_ATTEMPTS`   | 3           | Default retry attempts for jobs                    | 5       |
| `BULLMQ_BACKOFF_DELAY`      | 2000        | Delay between retries (milliseconds)               | 5000    |
| `BULLMQ_BACKOFF_TYPE`       | exponential | Backoff strategy: 'exponential', 'fixed', 'custom' | fixed   |

### Environment-Specific Configuration

**Development:**

```bash
BULLMQ_REMOVE_ON_COMPLETE=500 BULLMQ_DEFAULT_ATTEMPTS=2
```

**Production:**

```bash
BULLMQ_REMOVE_ON_COMPLETE=50 BULLMQ_DEFAULT_ATTEMPTS=5
```

**High-Volume:**

```bash
BULLMQ_REMOVE_ON_COMPLETE=10 BULLMQ_BACKOFF_DELAY=500
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
  Logger.info('Processing', job.data);
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
