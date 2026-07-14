# @zintrust/zedgi

Zedgi HTTPS transport drivers for ZinTrust cache, database, and queue integrations.

This package lets a ZinTrust app reach Redis, MySQL, PostgreSQL, and BullMQ queue operations through a Zedgi gateway by changing driver environment variables.

## Install

```bash
npm install @zintrust/zedgi @zedgi/zedgi-client
```

In ZinTrust monorepo builds, this package is auto-discovered when one of the Zedgi drivers is selected.

## Environment

```dotenv
USE_ZEDGI=true
ZEDGI_URL=https://YOUR_SUBDOMAIN.zedgi.app
ZEDGI_KEY=zk_...

# Optional. The SDK auto-pulls these when omitted.
ZEDGI_SIGNING_SECRET=
ZEDGI_PUBLIC_KEY=
ZEDGI_ACCOUNT_ID=
ZEDGI_KEY_VERSION=
ZEDGI_TIMEOUT=10000

# Optional signed plaintext metadata forwarded by Zedgi.
ZEDGI_REDIS_HEADER=
ZEDGI_QUEUE_HEADER=
ZEDGI_MYSQL_HEADER=
ZEDGI_POSTGRES_HEADER=

# Optional Redis credential profile for queues. Falls back to ZEDGI_REDIS_PROFILE.
ZEDGI_QUEUE_PROFILE=
ZEDGI_REDIS_PROFILE=
```

## Drivers

```dotenv
CACHE_DRIVER=redis-zedgi
DB_CONNECTION=mysql-zedgi
# or DB_CONNECTION=postgres-zedgi
# or DB_CONNECTION=pg-zedgi
QUEUE_CONNECTION=queue-zedgi
QUEUE_DRIVER=queue-zedgi
```

Zedgi stores the target host/port in its dashboard service registration. ZinTrust sends only auth/selection fields through the client SDK:

- Redis: `password`, `db`, optional `header`
- MySQL/Postgres: `user`, `password`, `database`, optional `ssl`, optional `header`

The package uses one shared Zedgi client/options object so account key, signing secret, and encrypted credential blobs are cached across cache, DB, and queue usage.

## Queue Support

`queue-zedgi` supports:

- `enqueue`
- `dequeue`
- `ack`
- `fail`
- `length`
- `drain`

Pull-based workers use Zedgi's Redis RPC BullMQ-intent operations, so `queue-zedgi`
can be used for producers, monitoring, and consumers. When `QUEUE_CONNECTION` and
`QUEUE_DRIVER` are both present, ZinTrust resolves `QUEUE_CONNECTION` first; set it
to `queue-zedgi` to keep workers, monitors, and producers on the same Zedgi-backed
Redis target.

When `ZEDGI_QUEUE_PROFILE` is set, the queue driver uses that named Redis
credential profile. ZinTrust registers the profile with the configured Redis DB
(`REDIS_QUEUE_DB` or `WORKERS_REDIS_QUEUE_DB`) so BullMQ keys are read from the
intended logical database.

## Registration

The package registers:

- Cache: `redis-zedgi`
- Database: `mysql-zedgi`, `postgres-zedgi`, `pg-zedgi`
- Queue: `queue-zedgi`

Manual registration is available with:

```ts
import '@zintrust/zedgi/register';
```
