# Cache System

Zintrust provides a unified, multi-driver cache system that allows you to store and retrieve data efficiently across different environments.

## Configuration

The cache system is configured via environment variables in your `.env` file or `Env` class.

```env
CACHE_DRIVER=memory # memory, kv, redis, mongodb
REDIS_HOST=localhost
REDIS_PORT=6379
MONGO_URI=your_mongo_uri
```

## Basic Usage

You can use the `cache` helper to interact with the configured cache driver.

```typescript
import { cache } from '@cache/Cache';

// Store an item (TTL in seconds)
await cache.set('user:1', { id: 1, name: 'John' }, 3600);

// Retrieve an item
const user = await cache.get('user:1');

// Check if item exists
if (await cache.has('user:1')) {
  // ...
}

// Delete an item
await cache.delete('user:1');

// Clear all items (if supported by driver)
await cache.clear();
```

## Supported Drivers

### Memory Driver (`memory`)

The default driver for local development. It stores data in a simple JavaScript `Map`.

### Cloudflare KV Driver (`kv`)

Designed for Cloudflare Workers. It uses the native `KV` binding (expected binding name: `CACHE`).

### Redis Driver (`redis`)

A zero-dependency implementation that communicates with Redis over TCP using the RESP protocol.

### MongoDB Driver (`mongodb`)

Uses the MongoDB Atlas Data API (HTTPS) for zero-dependency integration, making it ideal for serverless environments where TCP connections are limited.

## Automatic Serialization

The cache system automatically handles JSON serialization and deserialization for complex objects, so you can store arrays and objects directly.
