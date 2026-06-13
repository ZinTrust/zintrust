---
title: Redis Queue Adapter
description: Redis adapter for ZinTrust's queue system
---

# Redis Queue Adapter

The `@zintrust/queue-redis` package provides the Redis/BullMQ queue driver for ZinTrust. It can connect directly to Redis in Node.js, or route queue operations through [`@zintrust/redis-rpc`](https://www.npmjs.com/package/@zintrust/redis-rpc) when the caller runs in Cloudflare Workers or another runtime without direct Redis TCP access.

## Installation

```bash
zin add  @zintrust/queue-redis
```

For Cloudflare Workers producers, also install Redis RPC in the backend project that owns Redis:

```bash
npm install @zintrust/redis-rpc
USE_REDIS_PROXY=true
REDIS_RPC_URL=https://queues.example.com
```

## Configuration

Add the Redis queue configuration to your environment:

```typescript
// config/queue.ts
import { QueueConfig } from '@zintrust/core';

export const queue: QueueConfig = {
  driver: 'redis',
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB || '1'),
    keyPrefix: 'zintrust:queue:',
    maxRetriesPerRequest: 3,
    retryDelayOnFailover: 100,
    lazyConnect: true,
    keepAlive: 30000,
    family: 4,
  },
};
```

## Environment Variables

```bash
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your_password
REDIS_DB=1
```

### Cloudflare Tunnel Configuration

For optimal performance over Cloudflare tunnels, additional configuration options are available:

```bash
# Cloudflare tunnel-specific options
REDIS_CONNECT_TIMEOUT=3000
REDIS_KEEP_ALIVE=5000
REDIS_ENABLE_OFFLINE_QUEUE=true
REDIS_MAX_LOADING_RETRY_TIME=5000
```

See [Redis Cloudflare Tunnel Configuration](./redis-cloudflare-tunnel-config.md) for detailed guidance on tunnel-specific settings.

## Usage

```typescript
import { Queue } from '@zintrust/core';

// Define a job
const SendEmailJob = Queue.define({
  queue: 'email-queue',
  handler: async (job) => {
    const { to, subject, content } = job.data;
    await sendEmail(to, subject, content);
  },
  options: {
    attempts: 3,
    backoff: 'exponential',
    delay: 1000,
  },
});

// Dispatch a job
await SendEmailJob.dispatch({
  to: 'user@example.com',
  subject: 'Welcome!',
  content: 'Welcome to our service!',
});

// Process jobs
await Queue.process('email-queue', async (job) => {
  await SendEmailJob.handler(job);
});
```

## Features

- **Redis Lists**: Uses Redis LIST data structure for queues
- **Blocking Operations**: Efficient blocking pop operations
- **Priority Queues**: Support for priority-based job processing
- **Delayed Jobs**: Built-in support for delayed job execution
- **Job Retries**: Configurable retry strategies
- **Dead Letter Queues**: Automatic handling of failed jobs
- **Monitoring**: Built-in queue monitoring and metrics
- **Cluster Support**: Redis Cluster support
- **Pub/Sub**: Redis pub/sub for real-time notifications

## Deduplication Collision Behavior

The BullMQ-backed Redis adapter supports both duplicate suppression and serialized overlap queueing through `payload.deduplication.collisionBehavior`.

```typescript
await Queue.enqueue('ledger', {
  entryId: 'entry-123',
  deduplication: {
    id: 'account-42',
    ttl: 30000,
    collisionBehavior: 'enqueue',
  },
});
```

- `suppress` remains the default and returns the deduplication id when a live lock already exists
- `enqueue` keeps later same-key jobs in Redis so they wait behind the active lock instead of disappearing as hidden suppression

Use `enqueue` when jobs must execute sequentially for the same logical resource key but every job still needs a real queue record.

## Advanced Configuration

### Redis Cluster

```typescript
export const queue: QueueConfig = {
  driver: 'redis',
  redis: {
    cluster: [
      { host: 'redis-1', port: 6379 },
      { host: 'redis-2', port: 6379 },
      { host: 'redis-3', port: 6379 },
    ],
    options: {
      redisOptions: {
        password: 'your-password',
      },
      maxRedirections: 16,
      retryDelayOnFailover: 100,
    },
  },
};
```

### Sentinel Configuration

```typescript
export const queue: QueueConfig = {
  driver: 'redis',
  redis: {
    sentinels: [
      { host: 'sentinel-1', port: 26379 },
      { host: 'sentinel-2', port: 26379 },
      { host: 'sentinel-3', port: 26379 },
    ],
    name: 'mymaster',
    password: 'your-password',
  },
};
```

### Connection Pooling

```typescript
export const queue: QueueConfig = {
  driver: 'redis',
  redis: {
    // ... other config
    pool: {
      max: 10,
      min: 2,
      acquireTimeoutMillis: 30000,
      idleTimeoutMillis: 30000,
    },
  },
};
```

## Queue Types

### Standard Queue

```typescript
const StandardJob = Queue.define({
  queue: 'standard-queue',
  handler: async (job) => {
    console.log('Processing standard job:', job.data);
  },
});
```

### Priority Queue

```typescript
const PriorityJob = Queue.define({
  queue: 'priority-queue',
  priority: true, // Enable priority queue
  handler: async (job) => {
    console.log('Processing priority job:', job.data);
  },
});

// Dispatch with priority
await PriorityJob.dispatch(
  {
    message: 'High priority task',
  },
  {
    priority: 10, // 0-10 priority range
  }
);
```

### Delayed Queue

```typescript
const DelayedJob = Queue.define({
  queue: 'delayed-queue',
  delayed: true, // Enable delayed processing
  handler: async (job) => {
    console.log('Processing delayed job:', job.data);
  },
});

// Dispatch with delay
await DelayedJob.dispatch(
  {
    message: 'Process in 5 minutes',
  },
  {
    delay: 5 * 60 * 1000, // 5 minutes delay
  }
);
```

## Job Options

### Retry Configuration

```typescript
const RetryJob = Queue.define({
  queue: 'retry-queue',
  options: {
    attempts: 5,
    backoff: {
      type: 'exponential',
      delay: 1000,
      maxDelay: 60000,
    },
  },
  handler: async (job) => {
    await processJob(job.data);
  },
});
```

### Job Timeout

```typescript
const TimeoutJob = Queue.define({
  queue: 'timeout-queue',
  options: {
    timeout: 30000, // 30 seconds timeout
  },
  handler: async (job) => {
    await longRunningOperation(job.data);
  },
});
```

### Job Dependencies

```typescript
const ParentJob = Queue.define({
  queue: 'parent-queue',
  handler: async (job) => {
    await processParentTask(job.data);
  },
});

const ChildJob = Queue.define({
  queue: 'child-queue',
  dependencies: ['parent-queue'], // Wait for parent jobs
  handler: async (job) => {
    await processChildTask(job.data);
  },
});
```

## Advanced Features

### Batch Processing

```typescript
const BatchJob = Queue.define({
  queue: 'batch-queue',
  batchSize: 10,
  batchTimeout: 5000,
  handler: async (jobs) => {
    // Process multiple jobs at once
    const results = await processBatch(jobs.map((job) => job.data));
    return results;
  },
});
```

### Rate Limiting

```typescript
const RateLimitedJob = Queue.define({
  queue: 'rate-limited-queue',
  rateLimit: {
    max: 100, // Max 100 jobs
    period: 60000, // Per minute
  },
  handler: async (job) => {
    await processJob(job.data);
  },
});
```

### Job Chaining

```typescript
const Step1Job = Queue.define({
  queue: 'step1-queue',
  handler: async (job) => {
    const result = await processStep1(job.data);

    // Chain to next step
    await Step2Job.dispatch({
      ...job.data,
      step1Result: result,
    });
  },
});

const Step2Job = Queue.define({
  queue: 'step2-queue',
  handler: async (job) => {
    await processStep2(job.data);
  },
});
```

## Dead Letter Queues

### Configure DLQ

```typescript
const JobWithDLQ = Queue.define({
  queue: 'processing-queue',
  deadLetterQueue: {
    queue: 'dlq-processing',
    ttl: 7 * 24 * 60 * 60 * 1000, // 7 days TTL
  },
  options: {
    attempts: 3,
  },
  handler: async (job) => {
    await processJob(job.data);
  },
});
```

### Process Dead Letters

```typescript
const DLQJob = Queue.define({
  queue: 'dlq-processing',
  handler: async (job) => {
    console.log('Dead letter job:', job.data);
    console.log('Failed attempts:', job.attempts);
    console.log('Error:', job.error);

    // Decide whether to retry or archive
    if (shouldRetry(job)) {
      await JobWithDLQ.dispatch(job.data);
    } else {
      await archiveFailedJob(job);
    }
  },
});
```

## Monitoring and Metrics

### Queue Statistics

```typescript
const stats = await Queue.getStats('email-queue');
// Returns:
{
  queue: 'email-queue',
  waiting: 25,
  active: 3,
  completed: 1000,
  failed: 5,
  delayed: 10,
  paused: false,
  processing: 3,
}

const allStats = await Queue.getAllStats();
// Returns stats for all queues
```

### Job Information

```typescript
const jobInfo = await Queue.getJob('job-id');
// Returns:
{
  id: 'job-id',
  queue: 'email-queue',
  data: { /* job data */ },
  opts: { /* job options */ },
  progress: 50,
  attempts: 2,
  maxAttempts: 3,
  processedOn: 1640995200000,
  finishedOn: null,
  failedOn: null,
}
```

### Queue Health

```typescript
const health = await Queue.getHealth();
// Returns:
{
  connected: true,
  redis: {
    connected: true,
    host: 'localhost',
    port: 6379,
    db: 1,
  },
  queues: {
    total: 5,
    active: 3,
    paused: 0,
  },
}
```

## Real-time Notifications

### Redis Pub/Sub

```typescript
// Subscribe to queue events
Queue.on('job:completed', (jobId, result) => {
  console.log(`Job ${jobId} completed:`, result);
});

Queue.on('job:failed', (jobId, error) => {
  console.log(`Job ${jobId} failed:`, error);
});

Queue.on('queue:drained', (queueName) => {
  console.log(`Queue ${queueName} is empty`);
});

Queue.on('queue:stalled', (queueName) => {
  console.log(`Queue ${queueName} has stalled jobs`);
});
```

### Custom Events

```typescript
// Emit custom events
await Queue.emit('custom:event', {
  queue: 'email-queue',
  data: {
    /* custom data */
  },
});

// Listen for custom events
Queue.on('custom:event', (data) => {
  console.log('Custom event:', data);
});
```

## Performance Optimization

### Redis RPC for Cloudflare Workers

Redis RPC replaces the old BullMQ-over-command-proxy approach for queue workloads. BullMQ and its Lua scripts run on the Redis RPC server, not inside the Worker isolate. The Worker sends queue intent such as `add`, `dequeue`, `ack`, `length`, and `drain`.

Redis RPC is selected only when both variables are present:

```bash
USE_REDIS_PROXY=true
REDIS_RPC_URL=https://queues.example.com
```

Start the backend RPC server:

```bash
zin redis-rpc
# or
zin s redis-rpc
```

Keep using the older Redis HTTP proxy only for simple command-level cache operations when you do not need BullMQ semantics.

For pull-based consumers using Redis RPC `dequeue`, `@zintrust/redis-rpc@2.4.8` already repairs stale BullMQ `active` jobs before claiming new work. Tune the recovery window with `REDIS_RPC_STALE_ACTIVE_MS` on the Redis RPC server, or let it default to `max(visibilityTimeoutMs * 2, 120000)`.

### Lua Scripts

```typescript
// Use Lua scripts for atomic operations
const script = `
  local queue = KEYS[1]
  local job = ARGV[1]
  local priority = tonumber(ARGV[2])

  if priority > 0 then
    redis.call('ZADD', queue .. ':priority', priority, job)
  else
    redis.call('RPUSH', queue, job)
  end

  return 1
`;

await Queue.eval(script, 1, 'email-queue', JSON.stringify(jobData), 5);
```

### Pipeline Operations

```typescript
// Use Redis pipelines for bulk operations
const pipeline = Queue.pipeline();

for (let i = 0; i < 100; i++) {
  pipeline.rpush('bulk-queue', JSON.stringify(jobData[i]));
}

await pipeline.exec();
```

### Memory Optimization

```typescript
export const queue: QueueConfig = {
  driver: 'redis',
  redis: {
    // ... other config
    memory: {
      maxMemoryPolicy: 'allkeys-lru',
      maxMemory: '2gb',
    },
  },
};
```

## Error Handling

### Global Error Handler

```typescript
Queue.setErrorHandler(async (job, error) => {
  console.log('Job failed:', job.id, error.message);

  // Log to external monitoring
  await logError(job, error);

  // Send alert for critical errors
  if (error.severity === 'critical') {
    await sendAlert(error);
  }
});
```

### Queue-Specific Error Handler

```typescript
const ErrorHandlingJob = Queue.define({
  queue: 'error-handling-queue',
  errorHandler: async (job, error) => {
    console.log('Specific error handler for job:', job.id);

    // Custom error handling logic
    if (error.code === 'RETRYABLE') {
      return true; // Retry the job
    } else {
      return false; // Don't retry
    }
  },
  handler: async (job) => {
    await processJob(job.data);
  },
});
```

## Testing

### Mock Redis

```typescript
import { RedisMock } from '@zintrust/queue-redis';

// Use mock for testing
const mockQueue = new RedisMock();

// Mock Redis operations
mockQueue.on('rpush', (queue, data) => {
  console.log('Mock push:', queue, data);
});

// Test job processing
await mockQueue.process('test-queue', async (job) => {
  expect(job.data).toEqual({ test: 'data' });
});
```

### Integration Testing

```typescript
import { TestRedis } from '@zintrust/queue-redis';

// Use test Redis instance
const testQueue = new TestRedis({
  host: 'localhost',
  port: 6380, // Different port for testing
});

// Setup test data
await testQueue.clearQueue('test-queue');
await testQueue.addJob('test-queue', { test: 'data' });

// Run test
const result = await processTestJob();
expect(result).toBeTruthy();
```

## Security

### Authentication

```typescript
export const queue: QueueConfig = {
  driver: 'redis',
  redis: {
    host: 'localhost',
    port: 6379,
    password: 'your-secure-password',
    tls: {
      host: 'redis.example.com',
      port: 6380,
    },
  },
};
```

### Access Control

```typescript
export const queue: QueueConfig = {
  driver: 'redis',
  redis: {
    // ... other config
    acl: {
      username: 'queue-user',
      password: 'queue-password',
      commands: ['GET', 'SET', 'LPUSH', 'RPOP', 'ZADD'],
      keys: ['zintrust:queue:*'],
    },
  },
};
```

## Limitations

- **Memory Usage**: Redis is in-memory, large queues consume significant memory
- **Persistence**: Depends on Redis persistence configuration
- **Network Latency**: Network issues can affect performance
- **Single Point of Failure**: Single Redis instance can be a SPOF (mitigated with clustering)
- **Message Size**: Redis has limitations on individual value sizes
