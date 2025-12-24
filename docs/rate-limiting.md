# Rate Limiting

Zintrust includes a built-in, zero-dependency Rate Limiter to protect your application from abuse.

## Overview

The `RateLimiter` middleware uses a Token Bucket algorithm to limit the number of requests a client can make within a specified time window. It stores state in-memory, making it fast and efficient for single-instance deployments.

## Usage

### Global Rate Limiting

To apply rate limiting to all routes, register it in your application boot process:

```typescript
import { RateLimiter } from '@middleware';

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

## Configuration

| Option         | Type     | Default                | Description                                       |
| -------------- | -------- | ---------------------- | ------------------------------------------------- |
| `windowMs`     | number   | 60000                  | Time window in milliseconds.                      |
| `max`          | number   | 100                    | Maximum number of requests allowed per window.    |
| `message`      | string   | "Too many requests..." | Error message sent when limit is exceeded.        |
| `statusCode`   | number   | 429                    | HTTP status code returned when limit is exceeded. |
| `headers`      | boolean  | true                   | Whether to send `X-RateLimit-*` headers.          |
| `keyGenerator` | function | IP-based               | Function to generate a unique key for the client. |

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

- **Memory Usage**: The rate limiter stores client state in memory. A cleanup process runs every `windowMs` to remove expired entries.
- **Distributed Systems**: This implementation is in-memory only. For distributed deployments (e.g., multiple server instances), you should use a centralized store like Redis. (Note: The current implementation is zero-dependency and does not support Redis out of the box).
