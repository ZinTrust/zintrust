---
title: Redis Cache Adapter
description: Redis adapter for ZinTrust's cache system
---

# Redis Cache Adapter

The `@zintrust/cache-redis` package provides a Redis driver for ZinTrust's cache system, offering high-performance caching with Redis.

## Installation

```bash
zin add  @zintrust/cache-redis
```

## Configuration

Add the Redis cache configuration to your environment:

```typescript
// config/cache.ts
import { CacheConfig } from '@zintrust/core';

export const cache: CacheConfig = {
  driver: 'redis',
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB || '0'),
    ttl: 3600, // Default TTL in seconds
  },
};
```

## Environment Variables

```bash
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your_password
REDIS_DB=0
```

### Cloudflare Tunnel Configuration

For optimal performance over Cloudflare tunnels, additional configuration options are available:

```bash
# Cloudflare tunnel-specific options
REDIS_CONNECT_TIMEOUT=3000
REDIS_KEEP_ALIVE=5000
REDIS_ENABLE_OFFLINE_QUEUE=true
REDIS_MAX_LOADING_RETRY_TIME=5000
```

See [Redis Cloudflare Tunnel Configuration](./redis-cloudflare-tunnel-config.md) for detailed guidance on tunnel-specific settings.

## Usage

```typescript
import { Cache } from '@zintrust/core';

// Set a value
await Cache.set('user:123', { name: 'John', age: 30 }, 3600);

// Get a value
const user = await Cache.get('user:123');

// Delete a value
await Cache.delete('user:123');

// Clear all cache
await Cache.clear();

// Atomic operations
await Cache.increment('counter:123');
await Cache.decrement('counter:123');
```

## Features

- **High Performance**: Leverages Redis's in-memory storage
- **TTL Support**: Built-in expiration with Redis TTL
- **Connection Pooling**: Efficient Redis connection management
- **Cluster Support**: Redis Cluster configuration support
- **Pub/Sub**: Redis pub/sub capabilities
- **Pipeline Support**: Batch operations for improved performance

## Options

| Option                 | Type    | Default     | Description             |
| ---------------------- | ------- | ----------- | ----------------------- |
| `host`                 | string  | 'localhost' | Redis host              |
| `port`                 | number  | 6379        | Redis port              |
| `password`             | string  | undefined   | Redis password          |
| `db`                   | number  | 0           | Redis database number   |
| `ttl`                  | number  | 3600        | Default TTL in seconds  |
| `maxRetriesPerRequest` | number  | 3           | Max retries per request |
| `retryDelayOnFailover` | number  | 100         | Retry delay on failover |
| `lazyConnect`          | boolean | true        | Enable lazy connection  |

## Advanced Configuration

### Redis Cluster

```typescript
export const cache: CacheConfig = {
  driver: 'redis',
  redis: {
    cluster: [
      { host: 'redis-1', port: 6379 },
      { host: 'redis-2', port: 6379 },
      { host: 'redis-3', port: 6379 },
    ],
    ttl: 3600,
  },
};
```

### Sentinel Configuration

```typescript
export const cache: CacheConfig = {
  driver: 'redis',
  redis: {
    sentinels: [
      { host: 'sentinel-1', port: 26379 },
      { host: 'sentinel-2', port: 26379 },
    ],
    name: 'mymaster',
    ttl: 3600,
  },
};
```

## Error Handling

The Redis cache adapter includes comprehensive error handling for:

- Connection failures
- Network timeouts
- Authentication errors
- Memory limitations
- Cluster failover scenarios

## Performance Tips

1. **Use connection pooling** for high-traffic applications
2. **Enable compression** for large values
3. **Use appropriate TTL** values to balance performance and memory usage
4. **Monitor memory usage** to prevent Redis OOM errors
