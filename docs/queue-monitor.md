# Queue Monitor

The `@zintrust/queue-monitor` package provides a queue dashboard and metrics API for ZinTrust background jobs. In Node.js it can read BullMQ directly. In Cloudflare Workers or other runtimes without Redis TCP access, it can read through [`@zintrust/redis-rpc`](https://www.npmjs.com/package/@zintrust/redis-rpc).

## Installation

```bash
zin add @zintrust/queue-monitor
```

For Redis RPC mode:

```bash
npm install @zintrust/redis-rpc
USE_REDIS_PROXY=true
REDIS_RPC_URL=https://queues.example.com
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

## Cloudflare Workers

Do not create direct BullMQ or `ioredis` clients in Cloudflare Workers. Configure both `USE_REDIS_PROXY=true` and `REDIS_RPC_URL` so the monitor driver calls Redis RPC for snapshots, counts, recent jobs, and retry operations. The Redis RPC server owns the BullMQ clients and can be started with `zin redis-rpc` or `zin s redis-rpc`.

**Production:**

```bash
BULLMQ_REMOVE_ON_COMPLETE=50 BULLMQ_DEFAULT_ATTEMPTS=5
```

**High-Volume:**

```bash
BULLMQ_REMOVE_ON_COMPLETE=10 BULLMQ_BACKOFF_DELAY=500
```

## Queue Monitor Environment Variables

These settings control how the Queue Monitor dashboard is exposed:

| Environment Variable         | Default          | Description                                                         | Example       |
| ---------------------------- | ---------------- | ------------------------------------------------------------------- | ------------- |
| `QUEUE_MONITOR_ENABLED`      | `false`          | Enables Queue Monitor route registration                            | `true`        |
| `QUEUE_MONITOR_BASE_PATH`    | `/queue-monitor` | Base path for the dashboard and monitor endpoints                   | `/ops/queues` |
| `QUEUE_MONITOR_MIDDLEWARE`   | empty            | Comma-separated route middleware keys used to protect the dashboard | `auth,jwt`    |
| `QUEUE_MONITOR_AUTO_REFRESH` | `true`           | Enables dashboard auto-refresh by default                           | `false`       |
| `QUEUE_MONITOR_REFRESH_MS`   | `5000`           | Auto-refresh interval in milliseconds                               | `10000`       |
| `QUEUE_MONITOR_RECOVER_ACTIVE_LOCK_MS` | `30000` | BullMQ lock TTL used by the manual Recover action for stale active jobs | `45000` |

`QUEUE_MONITOR_MIDDLEWARE` accepts registered route middleware keys from your app, for example `auth` or `auth,jwt`, and also supports dynamic route middleware keys such as `rateLimit:1000:1`. ZinTrust validates these values during config load and throws if any configured value does not match a known route middleware key or supported dynamic middleware key.

Example:

```bash
QUEUE_MONITOR_ENABLED=true
QUEUE_MONITOR_BASE_PATH=/queue-monitor
QUEUE_MONITOR_MIDDLEWARE=rateLimit:1000:1
QUEUE_MONITOR_AUTO_REFRESH=true
QUEUE_MONITOR_REFRESH_MS=5000
QUEUE_MONITOR_RECOVER_ACTIVE_LOCK_MS=30000
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
  knownQueues: async () => ['emails', 'notifications'], // Optional stable queue inventory
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

`knownQueues` is optional but recommended when your worker topology is persisted outside live BullMQ keys. It keeps the queue selector stable even when a queue is temporarily idle, and the SSE dashboard now auto-recovers with a clean page reset if the live stream stays stale long enough to leave the UI out of sync.

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
