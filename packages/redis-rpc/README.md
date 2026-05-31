# Redis RPC BullMQ Proxy

This folder is a backend-owned replacement path for the current command-level Redis proxy. The client side should send raw intent:

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

The backend owns the real BullMQ operation against Redis. Frontend, Worker, schedule, queue monitor, and worker dashboard code should not emulate BullMQ internals when `USE_REDIS_PROXY=true`.

## Run Locally

The scripts load `.env` by default and use `REDIS_PASSWORD`, `REDIS_HOST`, `REDIS_PORT`, and `REDIS_QUEUE_DB`.

```bash
tsx redis-rpc/server.ts
```

Health:

```bash
curl http://127.0.0.1:8794/health
```

Run the BullMQ RPC smoke suite:

```bash
npm run redis-rpc:test
```

The test starts the RPC server, checks Redis `PING`, adds delayed and normal jobs, starts backend-owned BullMQ workers, verifies completed and failed job states, checks queue monitor snapshots/recent jobs, removes jobs, drains, cleans, and obliterates the temporary queue.

## Adapter Layer

`adapters.ts` exposes thin client-side wrappers for the shape `@zintrust/queue-redis`, `@zintrust/workers`, and `@zintrust/queue-monitor` need when `USE_REDIS_PROXY=true`:

- `createBullMqRpcQueue(queueName, options)` maps queue calls such as `add`, `getJob`, `getJobs`, and `getJobCounts` into queue RPC requests with the original method arguments preserved under `payload.args`.
- `createWorkerRpcRuntime(options)` maps `startWorker`, `stopWorker`, and `list` into backend-owned worker RPC requests.
- `createQueueMonitorRpcDriver(options)` maps snapshot, event, and recent-job reads into queue-monitor RPC requests.
- `createRedisRpcService(service, options)` creates a dynamic proxy, so `proxy.add(data, config)` becomes `{ service, method: "add", payload: { target, args: [data, config] } }`.

These adapters do not run BullMQ locally. They only pass intent to `/rpc`; the backend owns the Redis and BullMQ work.

## Supported RPC Services

- `queue`: `add`, `getJob`, `getJobs`, `getJobCounts`, `count`, `pause`, `resume`, `drain`, `clean`, `removeJob`, `retryJob`, `promoteJob`, `obliterate`, `closeQueue`
- `worker`: `startWorker`, `stopWorker`, `list`
- `queue-monitor`: `getSnapshot`, `getEvents`, `getRecentJobsForQueue`
- `redis`: `ping`, `call`

Custom services can be registered with `backend.registerService(name, handler)` for backend-local extensions that are not part of the default service list.

`REDIS_RPC_SECRET` protects `/rpc`; it falls back to `REDIS_PROXY_SECRET` or `APP_KEY` for local testing.
