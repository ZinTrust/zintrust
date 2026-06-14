# @zintrust/queue-redis

Redis queue driver registration for ZinTrust.

Docs: https://zintrust.com/package-queue-redis

## Install

```bash
npm i @zintrust/queue-redis
```

## Usage

```ts
import '@zintrust/queue-redis/register';
```

Then set `QUEUE_DRIVER=redis` and configure your Redis connection.

For Cloudflare Workers or any runtime without Redis TCP access, run Redis RPC from a Node.js backend and configure the Worker with both flags:

```bash
USE_REDIS_PROXY=true
REDIS_RPC_URL=https://queues.example.com
```

Start the backend with `zin redis-rpc` or `zin s redis-rpc`. See [`@zintrust/redis-rpc`](https://www.npmjs.com/package/@zintrust/redis-rpc).

If you use Redis RPC pull-style dequeue/ack flows, `@zintrust/redis-rpc@2.4.8` can already fail abandoned BullMQ `active` jobs automatically. Tune that recovery threshold with `REDIS_RPC_STALE_ACTIVE_MS` on the Redis RPC server.

## When to use

- ✅ Use `@zintrust/queue-redis` if you only need to **enqueue jobs** and another service will process them
- ❌ Use `@zintrust/queue-monitor` if you need full queue management (enqueue + process + monitor + retry)

**Note:** The monitor package can do everything queue-redis does, plus much more. So if you install `@zintrust/queue-monitor`, there's no need for `@zintrust/queue-redis`.

## License

This package and its dependencies are MIT licensed, permitting free commercial use.
