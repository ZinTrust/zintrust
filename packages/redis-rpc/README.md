# @zintrust/redis-rpc

`@zintrust/redis-rpc` provides an HTTP RPC boundary for Redis-backed BullMQ operations. It is designed for runtimes that cannot safely create direct Redis or BullMQ connections, such as Cloudflare Workers, queue dashboards, remote worker controllers, and thin application processes.

Instead of asking every package to emulate Redis commands or BullMQ Lua scripts, the caller sends a typed intent to a backend-owned RPC server. The RPC server owns the real Redis connection, BullMQ queues, queue events, and worker instances.

## When to use it

Use Redis RPC when:

- `USE_REDIS_PROXY=true` and `REDIS_RPC_URL` are both configured.
- Queue producers run in an environment where direct TCP Redis is unavailable.
- Queue monitor or worker dashboard code needs queue state without constructing local BullMQ clients.
- You want a single backend process to own Redis credentials and BullMQ execution details.

Use direct BullMQ/Redis when your process can safely connect to Redis and does not need a proxy boundary.

## Package layout

- `server.ts` starts the HTTP RPC server and exposes `/health` and `/rpc`.
- `backend.ts` implements the default services for queues, workers, queue monitor reads, and raw Redis calls.
- `client.ts` is the low-level HTTP client.
- `adapters.ts` contains convenience wrappers used by `@zintrust/queue-redis`, `@zintrust/queue-monitor`, and worker tooling.
- `env.ts` reads runtime configuration from `.env` and `process.env`.
- `types.ts` contains the public request, client, backend, and server types.
- `test-bullmq.mjs` is an end-to-end smoke test against a real Redis instance.

## Installation

```bash
npm install @zintrust/redis-rpc
```

For monorepo development this package is built like the other ZinTrust packages:

```bash
npm --prefix packages/redis-rpc run build
```

## Configuration

The server and client read these variables:

| Variable                   | Default                              | Purpose                                                         |
| -------------------------- | ------------------------------------ | --------------------------------------------------------------- |
| `REDIS_RPC_URL`            | empty                                | Full client base URL, for example `https://queues.example.com`. |
| `REDIS_RPC_HOST`           | `127.0.0.1`                          | Server listen host and client host fallback.                    |
| `REDIS_RPC_PORT`           | `8794`                               | Server listen port and client port fallback.                    |
| `REDIS_RPC_SECRET`         | `REDIS_PROXY_SECRET` or `APP_KEY`    | Shared secret sent as `x-redis-rpc-secret`.                     |
| `REDIS_RPC_REDIS_HOST`     | `REDIS_HOST` or `127.0.0.1`          | Redis host used by the RPC backend.                             |
| `REDIS_RPC_REDIS_PORT`     | `REDIS_PORT` or `6379`               | Redis port used by the RPC backend.                             |
| `REDIS_RPC_REDIS_PASSWORD` | `REDIS_PASSWORD`                     | Redis password used by the RPC backend.                         |
| `REDIS_RPC_REDIS_DB`       | `REDIS_QUEUE_DB`, `REDIS_DB`, or `0` | Redis database used for queue operations.                       |
| `REDIS_RPC_BULLMQ_PREFIX`  | `BULLMQ_PREFIX` or `bull`            | BullMQ key prefix used by the backend.                          |
| `REDIS_RPC_TIMEOUT_MS`     | `30000`                              | Client-side timeout used by integrations.                       |
| `REDIS_RPC_RETRY_MAX`      | `2`                                  | Client-side retry count used by integrations.                   |
| `REDIS_RPC_RETRY_DELAY_MS` | `500`                                | Client-side retry delay used by integrations.                   |

### Custom request headers

The client supports injecting extra HTTP headers into every outgoing RPC request. This uses the same environment-variable convention as all other ZinTrust proxy adapters (`REDIS_PROXY_HEADERS_*` for the redis-proxy, `MYSQL_PROXY_HEADERS_*` for MySQL, and so on).

**Pattern:** `REDIS_RPC_PROXY_HEADERS_{HEADER_NAME}=value`

Underscores in `HEADER_NAME` are converted to hyphens to form the actual header name.

| Environment variable | HTTP header sent |
| --- | --- |
| `REDIS_RPC_PROXY_HEADERS_X_Tenant_Id=abc` | `x-tenant-id: abc` |
| `REDIS_RPC_PROXY_HEADERS_Authorization=Bearer t` | `authorization: Bearer t` |
| `REDIS_RPC_PROXY_HEADERS_X_Trace_Id=xyz` | `x-trace-id: xyz` |
| `REDIS_RPC_PROXY_HEADERS_X_Custom_Header=foo` | `x-custom-header: foo` |

These headers are read once when `createRedisRpcClient()` is called and are sent on every request. They are merged after `x-redis-rpc-secret`, so they cannot accidentally overwrite authentication.

You can also pass headers directly in code. Programmatic headers take priority over env-sourced ones when a key collides:

```ts
const client = createRedisRpcClient({
  baseUrl: process.env.REDIS_RPC_URL,
  secret: process.env.REDIS_RPC_SECRET,
  headers: {
    'x-tenant-id': 'abc',
    'x-trace-id': '123',
  },
});
```

Both sources are combined: `{ ...rpcClientHeaders(), ...options.headers }`. To inspect what headers were auto-detected from env, call the exported helper directly:

```ts
import { rpcClientHeaders } from '@zintrust/redis-rpc';
console.log(rpcClientHeaders()); // { 'x-tenant-id': 'abc', ... } or undefined
```

Set both `USE_REDIS_PROXY=true` and `REDIS_RPC_URL` to make supported ZinTrust packages select Redis RPC automatically. `USE_REDIS_PROXY=true` by itself does not enable Redis RPC; it only says the process is allowed to use a Redis proxy transport.

## Running the server

From the repository:

```bash
tsx packages/redis-rpc/server.ts
```

From a ZinTrust project with `@zintrust/redis-rpc` installed:

```bash
zin redis-rpc
# or
zin s redis-rpc
```

CLI overrides:

```bash
zin redis-rpc --host 0.0.0.0 --port 8794 --redis-host 127.0.0.1 --redis-db 1
```

Health check:

```bash
curl http://127.0.0.1:8794/health
```

Example RPC request:

```bash
curl -X POST http://127.0.0.1:8794/rpc \
  -H 'content-type: application/json' \
  -H "x-redis-rpc-secret: $REDIS_RPC_SECRET" \
  -d '{
    "requestId": "example-1",
    "service": "queue",
    "method": "add",
    "payload": {
      "target": "emails",
      "args": ["send", {"to":"dev@example.com"}, {"attempts":3}]
    }
  }'
```

## Client usage

```ts
import { createRedisRpcClient } from '@zintrust/redis-rpc';

const client = createRedisRpcClient({
  baseUrl: process.env.REDIS_RPC_URL,
  secret: process.env.REDIS_RPC_SECRET,
});

const job = await client.queue('add', {
  target: 'emails',
  args: ['send', { to: 'dev@example.com' }, { attempts: 3 }],
});

const counts = await client.queue('getJobCounts', { target: 'emails' });
```

## Adapter usage

```ts
import {
  createBullMqRpcQueue,
  createQueueMonitorRpcDriver,
  createWorkerRpcRuntime,
} from '@zintrust/redis-rpc/adapters';

const queue = createBullMqRpcQueue('emails');
await queue.add('send', { to: 'dev@example.com' }, { attempts: 3 });

const monitor = createQueueMonitorRpcDriver();
const snapshot = await monitor.getSnapshot(['emails']);

const workers = createWorkerRpcRuntime();
await workers.startWorker('emails', 'emails-worker', { processor: 'echo' });
```

## Built-in services

### `queue`

Supported methods:

- `add` / `enqueue`
- `dequeue`
- `ack`
- `get` / `getJob`
- `getJobs`
- `getJobCounts` / `counts`
- `count` / `length`
- `pause`
- `resume`
- `drain`
- `clean`
- `removeJob`
- `retryJob`
- `promoteJob`
- `obliterate`
- `closeQueue`

Queue requests identify the queue with `payload.target`, `payload.queueName`, or `payload.queue`.

### `worker`

Supported methods:

- `startWorker`
- `stopWorker`
- `list`

The default backend processors are intentionally small (`echo`, `sum`, and `fail`) so smoke tests and simple remote workers can run without loading application code. Register custom backend services or extend the backend process when production worker processors need application-specific behavior.

### `queue-monitor`

Supported methods:

- `getSnapshot`
- `getEvents`
- `getRecentJobsForQueue`

`@zintrust/queue-monitor` uses this service automatically when both `USE_REDIS_PROXY=true` and `REDIS_RPC_URL` are configured.

### `redis`

Supported methods:

- `ping`
- `call`
- `pipeline`
- `multi`

Use raw Redis calls sparingly. Prefer queue and monitor methods because they preserve the BullMQ abstraction and keep Redis command details out of callers.

`call` accepts either positional args (`{ "args": ["SET", "key", "value", "EX", 60] }`) or a `command` plus args. Object-style option arguments are expanded for Redis clients, so cache calls such as `set(key, value, { EX: 60 })` work through RPC. `pipeline` and `multi` accept a `commands` array:

```json
{
  "service": "redis",
  "method": "multi",
  "payload": {
    "commands": [
      { "command": "SET", "args": ["key1", "value1"] },
      { "command": "INCRBY", "args": ["counter", 1] }
    ],
    "transaction": true
  }
}
```

## Custom services

```ts
import { createRedisRpcBackend, listenRedisRpcServer } from '@zintrust/redis-rpc/server';

const backend = createRedisRpcBackend();

backend.registerService('reports', async ({ method, payload }) => {
  if (method !== 'refresh') throw new Error(`Unsupported reports method: ${method}`);
  return { accepted: true, reportId: payload.reportId };
});

await listenRedisRpcServer({ backend, port: 8794 });
```

## ZinTrust integrations

- `@zintrust/queue-redis` routes `enqueue`, `dequeue`, `ack`, `length`, and `drain` through Redis RPC only when `USE_REDIS_PROXY=true` and `REDIS_RPC_URL` is configured.
- `@zintrust/queue-monitor` reads snapshots, job counts, recent jobs, and retry operations through Redis RPC in the same explicit mode.
- Core Redis transport uses Redis RPC for raw Redis commands when both flags are set, so cache and lock code can use Redis RPC without the older Redis HTTP proxy. When `USE_REDIS_PROXY=true` but `REDIS_RPC_URL` is empty, core Redis transport falls back to the legacy Redis HTTP proxy.
- `@zintrust/cache-redis` supports Redis RPC for the documented cache surface: `get`, `set`, `delete`, `clear`, `has`, `increment`, `decrement`, `getRedisClient().pipeline()`, and `getRedisClient().multi()`.
- Core env scaffolding includes the `REDIS_RPC_*` variables so generated projects can opt in without hand-editing config types.
- The existing queue HTTP gateway remains available for signed `/api/_sys/queue/rpc` traffic; when the queue driver is in Redis RPC mode, that gateway delegates to Redis RPC-backed queue operations.

## Verification

Run the focused checks:

```bash
npm --prefix packages/redis-rpc run type-check
npm --prefix packages/redis-rpc run build
npm --prefix packages/queue-redis run build
npm --prefix packages/queue-monitor run build
npm --prefix packages/workers run build
```

Run the BullMQ smoke test when a Redis instance is available:

```bash
npm --prefix packages/redis-rpc run test
```

The smoke test starts the RPC server, verifies Redis `PING`, adds normal and delayed jobs, starts backend-owned workers, checks completed and failed job states, reads queue monitor snapshots, removes jobs, drains, cleans, and obliterates the temporary queue.
