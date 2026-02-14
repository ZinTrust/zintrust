# middleware config

- Source: `src/config/middleware.ts`

## Usage

Import from the framework:

```ts
import { middleware } from '@zintrust/core';

// Example (if supported by the module):
// middleware.*
```

## Snapshot (top)

```ts
import { MiddlewareConfigType } from '@zintrust/core';
import {
  CsrfMiddleware,
  ErrorHandlerMiddleware,
  LoggingMiddleware,
  type Middleware,
  RateLimiter,
  SecurityMiddleware,
} from '@zintrust/core';

const shared = Object.freeze({
  log: LoggingMiddleware.create(),
  error: ErrorHandlerMiddleware.create(),
  security: SecurityMiddleware.create(),
  rateLimit: RateLimiter.create(),
  csrf: CsrfMiddleware.create({
    // Default: do not bypass CSRF.
    // Optional: bypass CSRF for path patterns (simple `*` glob), e.g. ['/api/*'].
    skipPaths: [],
  }),
} satisfies Record\<string, Middleware>);

const middlewareConfigObj: MiddlewareConfigType = {
  global: [shared.log, shared.error, shared.security, shared.rateLimit, shared.csrf],
  route: shared,
};

export const middlewareConfig = Object.freeze(middlewareConfigObj);
export default middlewareConfig;
```

### CSRF Redis Store (new)

- **What changed**: `CsrfTokenManager` now supports a Redis-backed store in addition to the in-memory Map. The implementation uses the project's `RedisKeys.getCsrfPrefix()` for key namespacing and stores token payloads with Redis TTLs so Redis expiry is relied upon for cleanup.
- **How to enable**: Set `CSRF_STORE=redis` (or `CSRF_DRIVER=redis`) in your environment. Optionally set `CSRF_REDIS_DB` to choose a Redis DB index; otherwise the queue/cache Redis DB settings are used. The manager will create/connect to Redis using the existing `REDIS_*` env settings (`REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`).
- **Key format**: Keys are created via `RedisKeys.createCsrfKey(sessionId)` (prefix from `RedisKeys.getCsrfPrefix()`), e.g. `{appPrefix}_csrf:{sessionId}`.
- **Behavioral notes**:
  - Tokens are stored as JSON blobs and saved with a TTL (PX) matching the configured token TTL (`TOKEN_TTL`).
  - Cleanup operations are effectively no-ops for Redis (expiry handled by Redis). The `cleanup()` method returns 0 for Redis but the API remains compatible.
  - Scanning/clear operations use `SCAN` with `MATCH {csrfPrefix}*` and `DEL` for explicit removal; avoid clearing large datasets in production without care.
- **Security & performance**:
  - Using Redis allows CSRF tokens to be shared across multiple app instances (horizontal scale) and avoids reliance on sticky sessions.
  - Monitor Redis keyspace and avoid storing unnecessarily long TTLs; token TTL defaults are driven by `TOKEN_TTL`.
- **Tests & templates**: Middleware and tests were updated to the async API (`generateToken`/`validateToken` now return Promises). Ensure any custom code calling the CSRF manager is updated to `await` the async calls.

## CSRF skip paths

ZinTrust CSRF uses a Double Submit Cookie pattern (cookie + header). If your application is a pure API
consumed with `Authorization: Bearer ...` (no cookie-based auth), you may prefer to bypass CSRF for API routes.

- Configure via `CSRF_SKIP_PATHS` environment variable: `CSRF_SKIP_PATHS=/api/*,/hooks/*`
- Or manually via code: `CsrfMiddleware.create({ skipPaths: [...] })`
- Patterns support simple glob matching where `*` matches any characters (example: `'/api/*'`)

## Dev Reload Notes

In ZinTrust, middleware config is created once and cached in-memory for the lifetime of the running Node process.
The HTTP Kernel also snapshots the resolved middleware list when it is created.

That means changes to `src/config/middleware.ts` (or other config modules) typically require a process restart to take effect.

- Use `zin s` during development: it restarts the server process when code/config changes, so updated config is picked up automatically.
- If you run the server manually (e.g. `node ...`), you must stop/restart it to apply config changes.

## Snapshot (bottom)

```ts
import { MiddlewareConfigType } from '@zintrust/core';
import {
  CsrfMiddleware,
  ErrorHandlerMiddleware,
  LoggingMiddleware,
  type Middleware,
  RateLimiter,
  SecurityMiddleware,
} from '@zintrust/core';

const shared = Object.freeze({
  log: LoggingMiddleware.create(),
  error: ErrorHandlerMiddleware.create(),
  security: SecurityMiddleware.create(),
  rateLimit: RateLimiter.create(),
  csrf: CsrfMiddleware.create(),
} satisfies Record\<string, Middleware>);

const middlewareConfigObj: MiddlewareConfigType = {
  global: [shared.log, shared.error, shared.security, shared.rateLimit, shared.csrf],
  route: shared,
};

export const middlewareConfig = Object.freeze(middlewareConfigObj);
export default middlewareConfig;
```
