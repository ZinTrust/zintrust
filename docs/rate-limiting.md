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

## Examples in Controllers

### Protecting Authentication Endpoints

```typescript
// app/Controllers/AuthController.ts
import { RateLimiter } from '@zintrust/core';
import type { Request, Response } from '@zintrust/core';

export async function login(req: Request, res: Response) {
  const { email, password } = req.body;
  const ip = req.getRaw().socket.remoteAddress;
  const key = `login:${email}:${ip}`;

  // Allow 5 login attempts per email+IP in 15 minutes
  if (!(await RateLimiter.attempt(key, 5, 15 * 60))) {
    const retryAfterSeconds = await RateLimiter.till(key);
    return res.status(429).json({
      message: 'Too many login attempts. Please try again later.',
      retryAfter: retryAfterSeconds,
    });
  }

  // Perform authentication...
  const user = await User.authenticate(email, password);

  if (!user) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  // Clear rate limit on successful login
  await RateLimiter.clear(key);

  return res.json({ user, token: generateToken(user) });
}

export async function register(req: Request, res: Response) {
  const { email } = req.body;
  const ip = req.getRaw().socket.remoteAddress;
  const key = `register:${ip}`;

  // Allow 3 registration attempts per IP in 1 hour
  if (!(await RateLimiter.attempt(key, 3, 60 * 60))) {
    const retryAfterSeconds = await RateLimiter.till(key);
    return res.status(429).json({
      message: 'Registration limit exceeded',
      retryAfter: retryAfterSeconds,
    });
  }

  // Create user...
  const user = await User.create({ email, ...req.body });

  return res.status(201).json({ user });
}

export async function requestPasswordReset(req: Request, res: Response) {
  const { email } = req.body;
  const key = `password-reset:${email}`;

  // Allow 3 password reset requests per email in 1 hour
  if (await RateLimiter.tooManyAttempts(key, 3)) {
    const retryAfterSeconds = await RateLimiter.till(key);
    return res.status(429).json({
      message: 'Too many password reset requests',
      retryAfter: retryAfterSeconds,
    });
  }

  await RateLimiter.attempt(key, 3, 60 * 60);

  // Send password reset email...
  await sendPasswordResetEmail(email);

  return res.json({ message: 'Password reset email sent' });
}
```

### Protecting API Endpoints

```typescript
// app/Controllers/ApiController.ts
import { RateLimiter } from '@zintrust/core';
import type { Request, Response } from '@zintrust/core';

export async function createPost(req: Request, res: Response) {
  const userId = req.context.user?.id;
  const key = `create-post:${userId}`;

  // Allow 10 posts per user per hour
  if (!(await RateLimiter.attempt(key, 10, 60 * 60))) {
    const retryAfterSeconds = await RateLimiter.till(key);
    return res.status(429).json({
      message: 'Post creation limit reached',
      retryAfter: retryAfterSeconds,
    });
  }

  const post = await Post.create({ ...req.body, userId });
  return res.status(201).json({ post });
}

export async function uploadFile(req: Request, res: Response) {
  const userId = req.context.user?.id;
  const key = `upload:${userId}`;

  // Allow 20 file uploads per user per day
  if (!(await RateLimiter.attempt(key, 20, 24 * 60 * 60))) {
    const retryAfterSeconds = await RateLimiter.till(key);
    return res.status(429).json({
      message: 'Daily upload limit reached',
      retryAfter: retryAfterSeconds,
      limit: 20,
    });
  }

  // Process file upload...
  const file = await processUpload(req.file);

  return res.json({ file });
}

export async function sendNotification(req: Request, res: Response) {
  const userId = req.context.user?.id;
  const key = `notifications:${userId}`;

  // Allow 50 notifications per user per hour
  if (await RateLimiter.tooManyAttempts(key, 50)) {
    return res.status(429).json({
      message: 'Notification rate limit exceeded',
      retryAfter: await RateLimiter.till(key),
    });
  }

  await RateLimiter.attempt(key, 50, 60 * 60);

  // Send notification...
  await Notification.send(userId, req.body);

  return res.json({ success: true });
}
```

### Protecting Resource Updates

```typescript
// app/Controllers/UserController.ts
import { RateLimiter } from '@zintrust/core';
import type { Request, Response } from '@zintrust/core';

export async function updateProfile(req: Request, res: Response) {
  const userId = req.context.user?.id;
  const key = `profile-update:${userId}`;

  // Allow 10 profile updates per user per hour
  if (!(await RateLimiter.attempt(key, 10, 60 * 60))) {
    return res.status(429).json({
      message: 'You are updating your profile too frequently',
      retryAfter: await RateLimiter.till(key),
    });
  }

  const user = await User.findOrFail(userId);
  await user.update(req.body);

  return res.json({ user });
}

export async function changeEmail(req: Request, res: Response) {
  const userId = req.context.user?.id;
  const key = `email-change:${userId}`;

  // Allow 2 email changes per user per day
  if (!(await RateLimiter.attempt(key, 2, 24 * 60 * 60))) {
    return res.status(429).json({
      message: 'Email change limit reached for today',
      retryAfter: await RateLimiter.till(key),
    });
  }

  const user = await User.findOrFail(userId);
  await user.update({ email: req.body.email });

  // Send verification email...
  await sendEmailVerification(user);

  return res.json({ message: 'Verification email sent' });
}
```

## Examples in Models

### Protecting Model Operations

```typescript
// app/Models/User.ts
import { Model, RateLimiter } from '@zintrust/core';
import type { IModel } from '@zintrust/core';

interface UserAttributes {
  id: number;
  email: string;
  name: string;
  password: string;
}

export const User = Model.define<UserAttributes>(
  {
    table: 'users',
    primaryKey: 'id',
    fillable: ['email', 'name', 'password'],
  },
  {
    async sendVerificationEmail(this: IModel<UserAttributes>) {
      const key = `verification-email:${this.getAttribute('id')}`;

      // Allow 3 verification emails per user per day
      if (!(await RateLimiter.attempt(key, 3, 24 * 60 * 60))) {
        const retryAfter = await RateLimiter.till(key);
        throw new Error(
          `Verification email limit reached. Try again in ${Math.ceil(retryAfter / 60)} minutes.`
        );
      }

      // Send email...
      await sendEmail(this.getAttribute('email'), 'Verify Your Email');

      return true;
    },

    async resetPassword(this: IModel<UserAttributes>, newPassword: string) {
      const key = `password-change:${this.getAttribute('id')}`;

      // Allow 5 password changes per user per day
      if (!(await RateLimiter.attempt(key, 5, 24 * 60 * 60))) {
        throw new Error('Password change limit reached for today');
      }

      await this.update({ password: hashPassword(newPassword) });

      // Clear login attempts on password change
      const loginKey = `login:${this.getAttribute('email')}`;
      await RateLimiter.clear(loginKey);

      return true;
    },

    async requestDataExport(this: IModel<UserAttributes>) {
      const key = `data-export:${this.getAttribute('id')}`;

      // Allow 2 data export requests per user per week
      if (!(await RateLimiter.attempt(key, 2, 7 * 24 * 60 * 60))) {
        const retryAfter = await RateLimiter.till(key);
        throw new Error(
          `Data export limit reached. Try again in ${Math.ceil(retryAfter / 3600)} hours.`
        );
      }

      // Queue data export job...
      await queueDataExport(this.getAttribute('id'));

      return true;
    },

    async deleteAccount(this: IModel<UserAttributes>) {
      const key = `account-deletion:${this.getAttribute('id')}`;

      // Check if there was a recent deletion attempt (1 per day)
      if (await RateLimiter.tooManyAttempts(key, 1)) {
        throw new Error('Account deletion already requested today');
      }

      await RateLimiter.attempt(key, 1, 24 * 60 * 60);

      // Soft delete or queue deletion...
      await this.update({ deletedAt: new Date() });

      return true;
    },
  }
);
```

### Protecting Batch Operations

```typescript
// app/Models/Post.ts
import { Model, RateLimiter } from '@zintrust/core';
import type { IModel } from '@zintrust/core';

interface PostAttributes {
  id: number;
  userId: number;
  title: string;
  content: string;
  published: boolean;
}

export const Post = Model.define<PostAttributes>(
  {
    table: 'posts',
    primaryKey: 'id',
    fillable: ['userId', 'title', 'content', 'published'],
  },
  {
    async publish(this: IModel<PostAttributes>) {
      const userId = this.getAttribute('userId');
      const key = `publish-post:${userId}`;

      // Allow 5 post publications per user per hour
      if (!(await RateLimiter.attempt(key, 5, 60 * 60))) {
        throw new Error('Publication rate limit exceeded');
      }

      await this.update({ published: true });

      // Notify subscribers...
      await notifySubscribers(this);

      return true;
    },

    async shareToSocial(this: IModel<PostAttributes>, platform: string) {
      const userId = this.getAttribute('userId');
      const key = `social-share:${userId}:${platform}`;

      // Allow 10 shares per platform per user per day
      if (!(await RateLimiter.attempt(key, 10, 24 * 60 * 60))) {
        const retryAfter = await RateLimiter.till(key);
        throw new Error(
          `Too many shares to ${platform}. Try again in ${Math.ceil(retryAfter / 3600)} hours.`
        );
      }

      // Share to social media...
      await shareToPlatform(this, platform);

      return true;
    },
  }
);
```

### Protecting External API Calls

```typescript
// app/Models/Integration.ts
import { Model, RateLimiter } from '@zintrust/core';
import type { IModel } from '@zintrust/core';

interface IntegrationAttributes {
  id: number;
  userId: number;
  provider: string;
  apiKey: string;
}

export const Integration = Model.define<IntegrationAttributes>(
  {
    table: 'integrations',
    primaryKey: 'id',
    fillable: ['userId', 'provider', 'apiKey'],
  },
  {
    async syncData(this: IModel<IntegrationAttributes>) {
      const integrationId = this.getAttribute('id');
      const key = `sync:${integrationId}`;

      // Allow 12 syncs per integration per day (every 2 hours)
      if (!(await RateLimiter.attempt(key, 12, 24 * 60 * 60))) {
        const retryAfter = await RateLimiter.till(key);
        throw new Error(
          `Sync rate limit reached. Next sync available in ${Math.ceil(retryAfter / 60)} minutes.`
        );
      }

      const provider = this.getAttribute('provider');
      const apiKey = this.getAttribute('apiKey');

      // Call external API...
      const data = await fetchFromProvider(provider, apiKey);

      // Process data...
      await processIntegrationData(data);

      return data;
    },

    async testConnection(this: IModel<IntegrationAttributes>) {
      const userId = this.getAttribute('userId');
      const key = `test-connection:${userId}`;

      // Allow 20 connection tests per user per hour
      if (!(await RateLimiter.attempt(key, 20, 60 * 60))) {
        throw new Error('Connection test limit exceeded');
      }

      const provider = this.getAttribute('provider');
      const apiKey = this.getAttribute('apiKey');

      // Test the connection...
      const isValid = await validateConnection(provider, apiKey);

      return isValid;
    },

    async webhookReceived(this: IModel<IntegrationAttributes>, payload: any) {
      const integrationId = this.getAttribute('id');
      const key = `webhook:${integrationId}`;

      // Allow 1000 webhook calls per integration per hour
      if (!(await RateLimiter.attempt(key, 1000, 60 * 60))) {
        throw new Error('Webhook rate limit exceeded');
      }

      // Process webhook...
      await processWebhook(payload);

      return true;
    },
  }
);
```

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
