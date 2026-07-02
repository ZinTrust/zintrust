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
```

## Drivers

```dotenv
CACHE_DRIVER=redis-zedgi
DB_CONNECTION=mysql-zedgi
# or DB_CONNECTION=postgres-zedgi
# or DB_CONNECTION=pg-zedgi
QUEUE_DRIVER=queue-zedgi
```

Zedgi stores the target host/port in its dashboard service registration. ZinTrust sends only auth/selection fields through the client SDK:

- Redis: `password`, `db`, optional `header`
- MySQL/Postgres: `user`, `password`, `database`, optional `ssl`, optional `header`

The package uses one shared Zedgi client/options object so account key, signing secret, and encrypted credential blobs are cached across cache, DB, and queue usage.

## Queue Support

`queue-zedgi` supports:

- `enqueue`
- `length`
- `drain`
- `ack`

Pull-based `dequeue` is intentionally unsupported because the Zedgi queue API does not currently expose a safe visibility-timeout claim operation. Use `queue-zedgi` for producers and monitoring, and run workers against the same Redis service directly.

## Registration

The package registers:

- Cache: `redis-zedgi`
- Database: `mysql-zedgi`, `postgres-zedgi`, `pg-zedgi`
- Queue: `queue-zedgi`

Manual registration is available with:

```ts
import '@zintrust/zedgi/register';
```
