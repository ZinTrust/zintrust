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

## Redis Driver (BullMQ-Powered)

- The Redis queue driver now uses **BullMQ** for enterprise-grade job processing with auto-scaling, circuit breaker, dead letter queue, and advanced monitoring.
- Configure via standard Redis environment variables (`REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, `REDIS_QUEUE_DB`).
- You can register the driver with `Queue.register('redis', RedisDriver)` and then call `Queue.enqueue('my-queue', payload, 'redis')`.

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
