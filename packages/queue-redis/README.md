# @zintrust/queue-redis

Redis queue driver registration for ZinTrust.

- Docs: https://zintrust.com/queue

## Install

```bash
npm i @zintrust/queue-redis
```

## Usage

```ts
import '@zintrust/queue-redis/register';
```

Then set `QUEUE_DRIVER=redis` and configure `REDIS_URL`.

For Cloudflare Workers, set `ENABLE_CLOUDFLARE_SOCKETS=true` and use a TCP-accessible Redis endpoint.

## When to use

- ✅ Use `@zintrust/queue-redis` if you only need to **enqueue jobs** and another service will process them
- ❌ Use `@zintrust/queue-monitor` if you need full queue management (enqueue + process + monitor + retry)

**Note:** The monitor package can do everything queue-redis does, plus much more. So if you install `@zintrust/queue-monitor`, there's no need for `@zintrust/queue-redis`.

## License

This package and its dependencies are MIT licensed, permitting free commercial use.
