# Redis RPC BullMQ Integration

Redis RPC is the backend-owned HTTP boundary for ZinTrust Redis and BullMQ workloads. Redis RPC becomes active in callers only when both `USE_REDIS_PROXY=true` and `REDIS_RPC_URL` are configured. Edge, serverless, scheduler, queue-monitor, dashboard, cache, and lock code can then send intent to the backend RPC server instead of constructing local BullMQ clients or emulating BullMQ Redis scripts.

The package is TypeScript end-to-end:

- `redis-rpc/backend.ts` exposes `createRedisRpcBackend(...)`
- `redis-rpc/client.ts` exposes `createRedisRpcClient(...)`
- `redis-rpc/adapters.ts` exposes the client-side adapter helpers
- `redis-rpc/server.ts` exposes `createRedisRpcServer(...)` and `listenRedisRpcServer(...)`
- `redis-rpc/env.ts`, `redis-rpc/errors.ts`, and `redis-rpc/types.ts` contain the shared runtime and type definitions
- `redis-rpc/test-bullmq.mjs` is the only remaining smoke test in `.mjs`

## Request Shape

The client sends raw intent to `/rpc`:

```json
{
  "service": "queue",
  "method": "getJob",
  "payload": {
    "queueName": "payments",
    "jobId": "123"
  }
}
```

The backend performs the real BullMQ/Redis operation and returns serialized data.

## Backend API

Use `createRedisRpcBackend(...)` to construct the backend runtime.

The backend is function-based and keeps internal state in closures. It returns a frozen object with:

- `prefix`
- `dispatch(service, method, payload)`
- `registerService(name, handler)`
- `close()`

### Custom services

Backend extensions can be registered with:

```ts
backend.registerService(name, handler)
```

This is intended for custom backend-local handlers that are not part of the built-in RPC surface.

## Client API

Use `createRedisRpcClient(...)` for RPC calls from the caller side.

The client exposes:

- `call(service, method, payload)`
- `queue(method, payload)`
- `worker(method, payload)`
- `monitor(method, payload)`
- `redis(method, payload)`
- `service(service, target?)`

### Custom request headers

The client can inject extra HTTP headers into every outgoing RPC request. Two ways to supply them:

**1. Environment variables** — same convention as all other ZinTrust proxies:

```
REDIS_RPC_PROXY_HEADERS_{HEADER_NAME}=value
```

Underscores in `HEADER_NAME` become hyphens. The headers are read once at client construction and sent on every request.

| Variable | Header sent |
| --- | --- |
| `REDIS_RPC_PROXY_HEADERS_X_Tenant_Id=abc` | `x-tenant-id: abc` |
| `REDIS_RPC_PROXY_HEADERS_Authorization=Bearer t` | `authorization: Bearer t` |
| `REDIS_RPC_PROXY_HEADERS_X_Trace_Id=xyz` | `x-trace-id: xyz` |

**2. Programmatic** — passed directly to `createRedisRpcClient`:

```ts
const client = createRedisRpcClient({
  baseUrl: process.env.REDIS_RPC_URL,
  secret: process.env.REDIS_RPC_SECRET,
  headers: { 'x-tenant-id': 'abc', 'x-trace-id': '123' },
});
```

Both sources are merged: env-sourced headers are the baseline, `options.headers` wins on collision. `x-redis-rpc-secret` is always set first and cannot be overwritten by either source.

To inspect the headers auto-detected from env:

```ts
import { rpcClientHeaders } from '@zintrust/redis-rpc';
console.log(rpcClientHeaders()); // { 'x-tenant-id': 'abc', ... } or undefined
```

### Dynamic service proxy forwarding

`createRedisRpcService(service, options)` creates a proxy that forwards method calls as RPC requests.

For example:

```ts
proxy.add(data, config)
```

becomes an RPC call shaped like:

```json
{
  "service": "queue",
  "method": "add",
  "payload": {
    "target": "payments",
    "args": [data, config]
  }
}
```

That forwarding behavior is preserved for DX and keeps the local adapter layer thin.

## Adapter Layer

`redis-rpc/adapters.ts` exposes thin wrappers for the intended `@zintrust/*` integration:

- `createBullMqRpcQueue(queueName, options)` maps queue methods such as `add`, `enqueue`, `get`, `getJob`, `getJobs`, `getJobCounts`, `count`, `pause`, `resume`, `drain`, `clean`, `removeJob`, `retryJob`, `promoteJob`, `obliterate`, `closeQueue`, and `close` into queue RPC requests
- `createWorkerRpcRuntime(options)` maps `startWorker`, `stopWorker`, and `list` into backend-owned worker RPC requests
- `createQueueMonitorRpcDriver(options)` maps snapshot, event, and recent-job reads into queue-monitor RPC requests
- `createRedisRpcService(service, options)` creates a dynamic proxy so method calls are forwarded as RPC requests with `payload.target` and `payload.args`

These adapters do not run BullMQ locally. They only pass intent to `/rpc`.

## Local Runtime

The local scripts load `.env` by default and use:

- `REDIS_PASSWORD`
- `REDIS_HOST`
- `REDIS_PORT`
- `REDIS_QUEUE_DB`

The RPC server uses these local overrides as well:

- `REDIS_RPC_REDIS_HOST`
- `REDIS_RPC_REDIS_PORT`
- `REDIS_RPC_REDIS_PASSWORD`
- `REDIS_RPC_REDIS_DB`

The server secret is read from:

1. `REDIS_RPC_SECRET`
2. `REDIS_PROXY_SECRET`
3. `APP_KEY`

The HTTP server listens on:

- `REDIS_RPC_HOST` default `127.0.0.1`
- `REDIS_RPC_PORT` default `8794`

The BullMQ prefix comes from:

- `REDIS_RPC_BULLMQ_PREFIX`
- fallback `BULLMQ_PREFIX`
- default `bull`

Custom HTTP headers injected into every client request:

- `REDIS_RPC_PROXY_HEADERS_{HEADER_NAME}` — underscores in `HEADER_NAME` become hyphens (see [Custom request headers](#custom-request-headers))

### Run locally

```bash
tsx redis-rpc/server.ts
```

Health check:

```bash
curl http://127.0.0.1:8794/health
```

### Smoke test

```bash
npm run redis-rpc:test
```

The smoke suite starts the RPC server, verifies Redis `PING`, exercises the adapter layer and dynamic proxy forwarding, adds delayed and normal jobs, promotes a delayed job, starts backend-owned BullMQ workers, verifies completed and failed states, checks queue-monitor snapshots and recent jobs, removes jobs, drains, cleans, and obliterates the temporary queue.

## Supported Services

- `queue`: `add`, `enqueue`, `get`, `getJob`, `getJobs`, `getJobCounts`, `count`, `pause`, `resume`, `drain`, `clean`, `removeJob`, `retryJob`, `promoteJob`, `obliterate`, `closeQueue`, `close`
- `worker`: `startWorker`, `stopWorker`, `list`
- `queue-monitor`: `getSnapshot`, `getEvents`, `getRecentJobsForQueue`
- `redis`: `ping`, `call`
- custom services: register backend handlers with `backend.registerService(name, handler)`

## Package Scripts

Added scripts in `package.json`:

- `redis-rpc:type-check`
- `redis-rpc:test`

## Verification

On 2026-05-31, `npm run redis-rpc:type-check` and `npm run redis-rpc:test` passed against the local Redis instance using the repository `.env` Redis credentials.
