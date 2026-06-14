---
title: Redis RPC
description: HTTP RPC boundary for Redis, BullMQ queues, workers, and queue monitoring
---

# Redis RPC

[`@zintrust/redis-rpc`](https://www.npmjs.com/package/@zintrust/redis-rpc) lets Cloudflare Workers and other non-TCP runtimes use Redis-backed ZinTrust features without opening direct Redis or BullMQ connections.

The package runs a Node.js RPC server that owns Redis credentials, BullMQ queues, queue events, and worker lifecycle operations. Client packages send intent to that server over HTTP.

As of `@zintrust/redis-rpc@2.4.8`, the backend performs stale-active recovery before claiming new work so abandoned BullMQ jobs do not remain `active` indefinitely.

## Install

Install the package in the backend project that will host the RPC server:

```bash
npm install @zintrust/redis-rpc
```

## Start the server

```bash
zin redis-rpc
# or
zin s redis-rpc
```

Override listener or Redis connection settings from the CLI:

```bash
zin redis-rpc \
  --host 0.0.0.0 \
  --port 8794 \
  --redis-host 127.0.0.1 \
  --redis-port 6379 \
  --redis-db 1
```

## Enable clients

Redis RPC is explicit. Both variables must be set:

```bash
USE_REDIS_PROXY=true
REDIS_RPC_URL=https://queues.example.com
REDIS_RPC_SECRET=change-me
```

`USE_REDIS_PROXY=true` by itself does not activate Redis RPC. `REDIS_RPC_URL` by itself also does not activate Redis RPC. ZinTrust requires both to avoid accidental proxy selection in local development.

## What it covers

Redis RPC covers:

- `@zintrust/queue-redis` queue operations: enqueue, dequeue, ack, length, drain.
- `@zintrust/queue-monitor` snapshots, counts, recent jobs, and retry operations.
- Core Redis transport for command-level cache and lock operations.
- Backend-owned BullMQ workers for RPC-managed processors.

The legacy Redis HTTP proxy remains available for simple Redis command forwarding. Prefer Redis RPC when queues, monitor, workers, cache, and locks should share one backend-owned Redis boundary.

## Cloudflare Workers

Cloudflare Workers should not create direct `ioredis` or BullMQ clients. Configure Worker deployments with `USE_REDIS_PROXY=true` and `REDIS_RPC_URL`, then run `zin redis-rpc` in a Node.js backend that can reach Redis.

The Worker can enqueue jobs, read monitor data, and use Redis-backed cache/lock calls through RPC. Application job processors still need to run in a backend runtime capable of persistent Redis/BullMQ connections.

## Stale active recovery

Redis RPC pull workers are expected to complete every dequeued job with `ack` or `fail` / `nack`. If a runtime crashes or never sends the terminal RPC call, BullMQ can be left with a job stuck in `active`.

To keep those jobs from staying active forever, `@zintrust/redis-rpc@2.4.8` performs a stale-active recovery pass before each `dequeue`:

- It scans up to 100 `active` jobs for the queue.
- It treats a job as stale when `processedOn` is older than `REDIS_RPC_STALE_ACTIVE_MS`.
- When `REDIS_RPC_STALE_ACTIVE_MS` is unset, the threshold defaults to `max(visibilityTimeoutMs * 2, 120000)`.
- Recovered jobs are discarded, failed explicitly, and their Redis RPC pull-claim keys are released.

Set `REDIS_RPC_STALE_ACTIVE_MS` on the backend server when you want a stricter or looser recovery window than the visibility-timeout-derived default.

The local source also runs this recovery from queue-monitor snapshot and recent-job reads, so stale active jobs are repaired even when no pull worker is polling the queue.

Manual recovery can force the same terminal-fail behavior through `queue.fail`:

```json
{
  "service": "queue",
  "method": "fail",
  "payload": {
    "target": "emails",
    "args": ["job-id", "manual stale active recovery"],
    "force": true,
    "discard": true,
    "visibilityTimeoutMs": 30000
  }
}
```

With `force` or `discard`, Redis RPC recreates the BullMQ pull-worker lock, discards retries, moves the job to failed, and releases the Redis RPC pull-claim key.
