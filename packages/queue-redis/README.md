# @zintrust/queue-redis

Redis queue driver registration for Zintrust.

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

## License

This package and its dependencies are MIT licensed, permitting free commercial use.
