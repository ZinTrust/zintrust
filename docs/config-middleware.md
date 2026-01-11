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
} satisfies Record<string, Middleware>);

const middlewareConfigObj: MiddlewareConfigType = {
  global: [shared.log, shared.error, shared.security, shared.rateLimit, shared.csrf],
  route: shared,
};

export const middlewareConfig = Object.freeze(middlewareConfigObj);
export default middlewareConfig;
```

## CSRF skip paths

ZinTrust CSRF uses a Double Submit Cookie pattern (cookie + header). If your application is a pure API
consumed with `Authorization: Bearer ...` (no cookie-based auth), you may prefer to bypass CSRF for API routes.

- Configure via `CsrfMiddleware.create({ skipPaths: [...] })`
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
} satisfies Record<string, Middleware>);

const middlewareConfigObj: MiddlewareConfigType = {
  global: [shared.log, shared.error, shared.security, shared.rateLimit, shared.csrf],
  route: shared,
};

export const middlewareConfig = Object.freeze(middlewareConfigObj);
export default middlewareConfig;
```
