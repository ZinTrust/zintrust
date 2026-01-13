# Rate Limiting

ZinTrust includes a built-in, zero-dependency Rate Limiter to protect your application from abuse.

## Overview

The `RateLimiter` middleware uses a simple fixed-window counter to limit the number of requests a client can make within a specified time window.

## Usage

### Global Rate Limiting

To apply rate limiting to all routes, register it in your application boot process:

```typescript
import { RateLimiter } from '@zintrust/core';

app.getMiddlewareStack().register(
  'rateLimit',
  RateLimiter.create({
    windowMs: 60 * 1000, // 1 minute
    max: 100, // 100 requests per minute
  })
);
```

### Route-Specific Rate Limiting

You can also apply rate limiting to specific routes or groups:

```typescript
router.group('/api', (api) => {
  // Stricter limit for API
  api.use(RateLimiter.create({ max: 60, windowMs: 60000 }));

  api.post('/login', 'AuthController@login');
});
```

### Generated service API

In addition to middleware, ZinTrust exposes a small generated API for programmatic limiting:

```typescript
import { RateLimiter } from '@zintrust/core';

const key = `login:${ip}`;

if (!(await RateLimiter.attempt(key, 5, 60))) {
  const retryAfterSeconds = await RateLimiter.till(key);
  return res.status(429).json({ message: 'Too many attempts', retryAfterSeconds });
}
```

Available methods:

- `RateLimiter.attempt(key, maxAttempts, decaySeconds)`
- `RateLimiter.tooManyAttempts(key, maxAttempts)`
- `RateLimiter.till(key)`
- `RateLimiter.clear(key)`

### Store selection

By default, rate limiting uses an in-process memory store.

You can switch the programmatic API store via:

- `RateLimiter.configure({ store: 'memory' | 'redis' | 'kv' | 'db' })`, or
- env vars: `RATE_LIMIT_STORE` / `RATE_LIMIT_DRIVER`

Notes:

- `db` maps to the built-in `mongodb` cache store.
- Remote stores rely on TTL for expiration; memory uses lazy cleanup.

You can also select a store per middleware instance:

```typescript
RateLimiter.create({ store: 'redis', windowMs: 60_000, max: 100 });
```

## Configuration

| Option         | Type     | Default                | Description                                                   |
| -------------- | -------- | ---------------------- | ------------------------------------------------------------- |
| `windowMs`     | number   | 60000                  | Time window in milliseconds.                                  |
| `max`          | number   | 100                    | Maximum number of requests allowed per window.                |
| `message`      | string   | "Too many requests..." | Error message sent when limit is exceeded.                    |
| `statusCode`   | number   | 429                    | HTTP status code returned when limit is exceeded.             |
| `headers`      | boolean  | true                   | Whether to send `X-RateLimit-*` headers.                      |
| `keyGenerator` | function | IP-based               | Function to generate a unique key for the client.             |
| `store`        | string   | "memory"               | Store for rate limit state: `memory` / `redis` / `kv` / `db`. |

## Custom Key Generator

By default, the rate limiter uses the client's IP address. You can provide a custom key generator to limit by user ID, API key, or other criteria.

```typescript
RateLimiter.create({
  keyGenerator: (req) => {
    return req.context.user?.id || req.getRaw().socket.remoteAddress;
  },
});
```

## Headers

When enabled, the following headers are sent with each response:

- `X-RateLimit-Limit`: The maximum number of requests allowed in the current window.
- `X-RateLimit-Remaining`: The number of requests remaining in the current window.
- `X-RateLimit-Reset`: The time (in seconds) until the window resets.

## Performance Considerations

### Memory Usage

With the default memory store, rate limit state is kept in-process and expired entries are removed via lazy cleanup (every `windowMs` milliseconds).

**Memory Formula**:

```
Memory ≈ unique_ips × num_limiters × ~64_bytes × requests_per_window
```

**Expected Memory Usage by Traffic Level**:

| Traffic Pattern   | Unique IPs | Memory Usage | Risk Level  | Recommended Store |
| ----------------- | ---------- | ------------ | ----------- | ----------------- |
| Low (dev/test)    | 10–100     | ~25 KB       | ✅ None     | `memory`          |
| Medium (staging)  | 1,000      | ~256 KB      | ✅ Safe     | `memory`          |
| High (production) | 10,000+    | ~2.5 MB      | ⚠️ Monitor  | `redis` / `kv`    |
| DDoS/Bot attack   | 100,000+   | ~25 MB       | 🔴 Critical | `redis` / `kv`    |

**Key Points**:

- Memory is **not a leak**—entries expire and are cleaned up lazily during the next request.
- Within a single cleanup interval (`windowMs`), growth is unbounded if traffic contains unique IPs.
- Each rate limiter instance (global + route-specific) maintains its own state, multiplying memory usage.

### Distributed Systems

For multi-instance deployments, pick a remote store (`redis`, `kv`, or `db`) so all instances share the same limiter state and benefit from centralized cleanup.

### Production Recommendations

- **Up to 1,000 req/s with <10k unique IPs**: Memory store is fine; monitor heap usage.
- **>1,000 req/s or >10k unique IPs**: Switch to `redis` or `kv`:
  ```typescript
  // In config/middleware.ts
  export default {
    rateLimit: { store: 'redis' },
    fillRateLimit: { store: 'redis', max: 5, windowMs: 60_000 },
    authRateLimit: { store: 'redis', max: 10, windowMs: 60_000 },
    userMutationRateLimit: { store: 'redis', max: 20, windowMs: 60_000 },
  };
  ```
- **DDoS/Bot Mitigation**: Use a remote store + consider a WAF or rate limiting at the edge (e.g., Cloudflare, AWS Shield).
