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

- `enqueue(queue, payload): Promise<string>`
- `dequeue(queue): Promise<QueueMessage | undefined>`
- `ack(queue, id): Promise<void>`
- `length(queue): Promise<number>`
- `drain(queue): Promise<void>`

Notes:

- The in-memory driver is NOT suitable for production — use Redis or another durable backend for PHASE 1.5 production work.
- Drivers should be registered with `Queue.register('redis', RedisDriver)`.

## Redis Driver (Quick Usage)

- The Redis queue driver stores messages as JSON strings in a Redis list and provides a minimal, reliable surface for enqueue/dequeue operations.
- Configure via `REDIS_URL` (e.g., `redis://:password@host:6379`).
- You can register the driver with `Queue.register('redis', RedisDriver)` and then call `Queue.enqueue('my-queue', payload, 'redis')`.

### Install Redis driver

```bash
zin add queue:redis
```

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
