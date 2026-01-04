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
  csrf: CsrfMiddleware.create(),
} satisfies Record<string, Middleware>);

const middlewareConfigObj: MiddlewareConfigType = {
  global: [shared.log, shared.error, shared.security, shared.rateLimit, shared.csrf],
  route: shared,
};

export const middlewareConfig = Object.freeze(middlewareConfigObj);
export default middlewareConfig;
```

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
