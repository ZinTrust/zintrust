# @zintrust/cache-redis

Redis cache driver package for ZinTrust.

Docs: https://zintrust.com/package-cache-redis

## Install

Recommended (installs + wires registration):

```bash
zin add cache:redis
```

Or install directly:

```bash
npm i @zintrust/cache-redis redis
```

## Usage

Ensure the driver is registered at startup (before using `cache`):

```ts
import '@zintrust/cache-redis/register';
```

Then set your cache driver config (see docs for the full set of env vars):

```env
CACHE_DRIVER=redis
```

## Cloudflare Workers

When the app runs in Cloudflare Workers or another runtime without Redis TCP access, use Redis RPC:

```bash
npm i @zintrust/redis-rpc

USE_REDIS_PROXY=true
REDIS_RPC_URL=https://queues.example.com
```

Run the backend with `zin redis-rpc` or `zin s redis-rpc`. The Redis cache driver will send `get`, `set`, `del`, `exists`, and `flushdb` through the core Redis RPC transport. The older Redis HTTP proxy remains available for simple command forwarding through `REDIS_PROXY_URL`.

## Docs

- https://zintrust.com/cache
- https://zintrust.com/adapters

## License

This package and its dependencies are MIT licensed, permitting free commercial use.
