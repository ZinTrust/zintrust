---
title: Redis RPC
description: HTTP RPC boundary for Redis, BullMQ queues, workers, and queue monitoring
---

# Redis RPC

[`@zintrust/redis-rpc`](https://www.npmjs.com/package/@zintrust/redis-rpc) lets Cloudflare Workers and other non-TCP runtimes use Redis-backed ZinTrust features without opening direct Redis or BullMQ connections.

The package runs a Node.js RPC server that owns Redis credentials, BullMQ queues, queue events, and worker lifecycle operations. Client packages send intent to that server over HTTP.

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
