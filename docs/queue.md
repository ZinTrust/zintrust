# Async Queue (Redis) — Quickstart

This module provides an abstraction for job queues and drivers. A simple in-memory driver is included for testing and local development.

API (Queue):

- `Queue.register(name, driver)` — register a new driver
- `Queue.get(name?)` — get a driver (defaults to `process.env.QUEUE_DRIVER` or `inmemory`)
- `Queue.enqueue(queue, payload)` — enqueue a job
- `Queue.dequeue(queue)` — dequeue next job
- `Queue.ack(queue, id)` — acknowledge a job
- `Queue.length(queue)` — get pending job count
- `Queue.drain(queue)` — clear all jobs

Driver interface:

- `enqueue(queue, payload): Promise\<string>`
- `dequeue(queue): Promise\<QueueMessage | undefined>`
- `ack(queue, id): Promise\<void>`
- `length(queue): Promise\<number>`
- `drain(queue): Promise\<void>`

Notes:

- The in-memory driver is NOT suitable for production — use Redis or another durable backend for PHASE 1.5 production work.
- Drivers should be registered with `Queue.register('redis', RedisDriver)`.

## Sync Driver

When `QUEUE_DRIVER=sync`, jobs are processed synchronously and immediately. This is useful for testing and development but **requires explicit worker execution** after enqueuing.

### Important: Manual Worker Execution Required

With the sync driver, you must manually call the worker runner to process enqueued jobs:

```typescript
import { EmailQueue } from '@app/Workers/EmailWorker';

// Enqueue a job
await EmailJobService.sendWelcome('test@zintrust.com', 'Test User', 'example-mysql1');

// IMPORTANT: Process the job immediately (required for sync driver)
await EmailQueue.processOne('example-mysql1');

// Or process all jobs
await EmailQueue.processAll('example-mysql1');
```

### When to Use Sync Driver

- ✅ **Development & Testing** - Immediate feedback and debugging
- ✅ **Simple Applications** - No background processing needed
- ✅ **Unit Tests** - Predictable, synchronous behavior

### Limitations

- ⚠️ **Blocking** - Jobs block the request/response cycle
- ⚠️ **No Persistence** - Jobs are lost if application crashes
- ⚠️ **No Retry** - Failed jobs are not retried automatically
- ⚠️ **Manual Processing** - Must explicitly call worker methods

### Migration to Production

For production use, switch to Redis driver:

```bash
# Development (sync)
QUEUE_DRIVER=sync

# Production (Redis)
QUEUE_DRIVER=redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your-password
```

## Redis Driver (BullMQ-Powered)

- The Redis queue driver now uses **BullMQ** for enterprise-grade job processing with auto-scaling, circuit breaker, dead letter queue, and advanced monitoring.
- Configure via standard Redis environment variables (`REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, `REDIS_QUEUE_DB`).
- You can register the driver with `Queue.register('redis', RedisDriver)` and then call `Queue.enqueue('my-queue', payload, 'redis')`.
- For Cloudflare Workers, set `ENABLE_CLOUDFLARE_SOCKETS=true` and use a TCP-accessible Redis endpoint.

### Architecture: Producer vs Consumer (Cloudflare)

If you deploy your API to Cloudflare Workers, **you cannot run Queue Consumers (Workers) in the same process** because BullMQ/Redis consumers require Node.js primitives not available in the Edge runtime.

**The Solution:**
Split your deployment into two services:

1.  **Producer (Cloudflare Worker)**: Handles API requests, validates inputs, and **enqueues** jobs to Redis.
2.  **Consumer (Container/Node.js)**: A separate Node.js service (e.g. Docker, Railway, Fly.io, EC2) that connects to the _same_ Redis instance, **consumes** jobs, and processes them.

See [Architecture: Producer-Consumer Model](./architecture-producer-consumer.md) for setup details.

### Queue HTTP Gateway (Cloudflare without Redis TCP)

When Cloudflare Workers cannot open Redis TCP sockets in your environment, ZinTrust can proxy queue commands over HTTP to a Docker/Node API that runs `BullMQRedisQueue` locally.

Producer-side env (Cloudflare/serverless):

```bash
QUEUE_HTTP_PROXY_ENABLED=true
QUEUE_HTTP_PROXY_URL=http://your-docker-api:7772
QUEUE_HTTP_PROXY_PATH=/api/_sys/queue/rpc
QUEUE_HTTP_PROXY_KEY_ID=your-key-id
QUEUE_HTTP_PROXY_KEY=your-secret
```

Gateway-side env (Docker/Node API):

```bash
QUEUE_HTTP_PROXY_GATEWAY_ENABLED=true
QUEUE_HTTP_PROXY_KEY_ID=your-key-id
QUEUE_HTTP_PROXY_KEY=your-secret
QUEUE_HTTP_PROXY_MAX_SKEW_MS=60000
QUEUE_HTTP_PROXY_NONCE_TTL_MS=120000
```

Manual request samples are available in [requests/queue-http-gateway.http](../requests/queue-http-gateway.http).

### BullMQ Environment Variables

When `QUEUE_DRIVER=redis`, the system uses BullMQ with these customizable settings:

| Environment Variable        | Default     | Description                                        | Example |
| --------------------------- | ----------- | -------------------------------------------------- | ------- |
| `BULLMQ_REMOVE_ON_COMPLETE` | 100         | Number of completed jobs to keep in Redis          | 200     |
| `BULLMQ_REMOVE_ON_FAIL`     | 50          | Number of failed jobs to keep in Redis             | 25      |
| `BULLMQ_DEFAULT_ATTEMPTS`   | 3           | Default retry attempts for jobs                    | 5       |
| `BULLMQ_BACKOFF_DELAY`      | 2000        | Delay between retries (milliseconds)               | 5000    |
| `BULLMQ_BACKOFF_TYPE`       | exponential | Backoff strategy: 'exponential', 'fixed', 'custom' | fixed   |

### Environment-Specific Examples

**Development Environment:**

```bash
BULLMQ_REMOVE_ON_COMPLETE=500
BULLMQ_REMOVE_ON_FAIL=100
BULLMQ_DEFAULT_ATTEMPTS=2
BULLMQ_BACKOFF_DELAY=10000
```

**Production Environment:**

```bash
BULLMQ_REMOVE_ON_COMPLETE=50
BULLMQ_REMOVE_ON_FAIL=20
BULLMQ_DEFAULT_ATTEMPTS=5
BULLMQ_BACKOFF_DELAY=1000
```

**High-Volume Environment:**

```bash
BULLMQ_REMOVE_ON_COMPLETE=10
BULLMQ_REMOVE_ON_FAIL=5
BULLMQ_BACKOFF_DELAY=500
```

### Install Redis driver

```bash
zin add queue:redis
```

### When to use queue-redis vs queue-monitor

- ✅ Use `@zintrust/queue-redis` if you only need to **enqueue jobs** and another service will process them
- ✅✅ Use `@zintrust/queue-monitor` if you need full queue management (enqueue + process + monitor + retry)

**Note:** The monitor package can do everything queue-redis does, plus much more. So if you install `@zintrust/queue-monitor`, there's no need for `@zintrust/queue-redis`.

## RabbitMQ Driver

Install:

```bash
zin add queue:rabbitmq
```

### Cloudflare Workers (HTTP Gateway)

RabbitMQ AMQP TCP connections are not available in Workers without an HTTP gateway. Use a gateway service that exposes the following endpoints and configure the gateway URL:

- `POST /enqueue` → `{ id: string }`
- `POST /dequeue` → `{ message?: { id: string; payload: unknown; attempts: number } | null }`
- `POST /ack` → `{ ok: true }`
- `POST /length` → `{ length: number }`
- `POST /drain` → `{ ok: true }`

Set environment variables:

- `RABBITMQ_HTTP_GATEWAY_URL`
- `RABBITMQ_HTTP_GATEWAY_TOKEN` (optional)
- `RABBITMQ_HTTP_GATEWAY_TIMEOUT_MS` (optional, default 15000)

## AWS SQS Driver

Install:

```bash
zin add queue:sqs
```

Note: This driver uses `rPush`/`lPop` semantics; `ack()` is a no-op for this simple implementation. For visibility timeouts and retry mechanics, implement a processing list (BRPOPLPUSH) and message requeueing.

## CI integration

- A GitHub Actions workflow is provided at `.github/workflows/redis-integration.yml` to run the Redis integration test when a Redis endpoint is configured in the repository secrets as `INTEGRATION_REDIS_URL`.
- To enable: add a repository secret `INTEGRATION_REDIS_URL` with a value like `redis://:password@host:6379` and the workflow will run automatically on push/pull_request, or you can trigger it manually via "Run workflow" in the Actions tab.
- For self-hosted Redis in CI you can use a managed host (Upstash/Redis Cloud) and set the connection URL as the secret.

## Integration testing

- Integration tests that exercise a real Redis instance are included under `tests/integration/queue/Redis.integration.test.ts`.
- To run them locally or in CI, set `REDIS_URL` to a reachable Redis instance (e.g., `redis://:password@host:6379`).
- The integration test is skipped automatically when `REDIS_URL` is not set so CI jobs that don't have a Redis dependency will not fail.
