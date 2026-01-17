# @zintrust/cache-redis

Redis cache driver package for ZinTrust.

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

## Docs

- https://zintrust.com/cache
- https://zintrust.com/adapters

## License

This package and its dependencies are MIT licensed, permitting free commercial use.
