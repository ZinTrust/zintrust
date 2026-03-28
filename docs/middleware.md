# Middleware

Middleware is the request pipeline layer that runs before your route handler. Use it to reject requests, attach request context, apply rate limits, parse bodies, or enforce validation and authentication.

Routes attach middleware by string key through route metadata. ZinTrust supports that runtime model while also giving you a typed registry so middleware names can be checked at build time instead of failing silently at runtime.

## Interface Reference

```typescript
export type Middleware = (
  req: IRequest,
  res: IResponse,
  next: () => Promise<void>
) => Promise<void>;

export interface IMiddlewareStack {
  register(name: string, handler: Middleware): void;
  execute(request: IRequest, response: IResponse, only?: string[] | Middleware[]): Promise<void>;
  getMiddlewares(): Array<{ name: string; handler: Middleware }>;
}
```

## Registration Model

The effective middleware registry is the combination of two layers:

- Framework-owned middleware keys in `src/config/middleware.ts`
- Project-owned middleware entries in `config/middleware.ts`

The framework exposes a canonical built-in key list through `MiddlewareKeys` and the corresponding `MiddlewareKey` type. Fresh apps can add their own `global` and `route` middleware entries in `config/middleware.ts`.

At runtime, the HTTP kernel resolves route metadata keys against the registered middleware map. Unknown keys are currently skipped rather than throwing, which is why compile-time validation is worth using.

## Defining Middleware

Project middleware lives in `app/Middleware`. You can scaffold one with:

```bash
zin add middleware AuthMiddleware
```

That command generates the file and registers it in `config/middleware.ts` as route middleware so it can be attached by name immediately.

A middleware implementation must match the `Middleware` type:

```typescript
import type { Middleware } from '@zintrust/core';

export const AuthMiddleware: Middleware = async (req, res, next) => {
  if (!req.getHeader('authorization')) {
    res.setStatus(401).json({ error: 'Unauthorized' });
    return;
  }

  await next();
};
```

## Fresh App Workflow

For application-owned middleware, the normal flow is:

1. Create a middleware in `app/Middleware`.
2. Import it into `config/middleware.ts`.
3. Register it under `route` or append it under `global`.
4. Reference the route middleware key in route metadata.
5. Extend the route middleware key type locally when you want compile-time checking for project-only keys.

Example middleware:

```typescript
import type { Middleware } from '@zintrust/core';

export const AuthMiddleware: Middleware = async (_req, _res, next) => {
  await next();
};
```

Example `config/middleware.ts` registration:

```typescript
import type { MiddlewaresType } from '@zintrust/core';
import { AuthMiddleware } from '@app/Middleware/AuthMiddleware';

export default {
  route: {
    authMiddleware: AuthMiddleware,
  },
} as MiddlewaresType;
```

Example route usage:

```typescript
import { Router, type IRouter, type MiddlewareKey } from '@zintrust/core';

type AppMiddlewareKey = MiddlewareKey | 'authMiddleware';

export function registerRoutes(router: IRouter): void {
  Router.get<AppMiddlewareKey>(
    router,
    '/profile',
    async (_req, res) => {
      res.json({ ok: true });
    },
    {
      middleware: ['authMiddleware'],
    }
  );
}
```

Use `global` when the middleware should run for every request. Use `route` when it should be opt-in by key.

## Overriding Built-In Middleware

Fresh apps can override framework middleware without forking core code. Register a project middleware under the same built-in key in `config/middleware.ts`, and the project entry wins over the built-in one at runtime.

This is useful when you want to keep route metadata like `middleware: ['jwt']` unchanged but customize the response body or auth behavior.

For shared built-ins that also participate in the global stack, the override is applied there too. That includes keyed middleware such as `log`, `error`, `security`, `rateLimit`, `csrf`, `sanitizeBody`, `auth`, `jwt`, `bulletproof`, and the built-in validation keys.

Framework-internal global middleware that are not exposed as keyed entries, such as body parsing and file upload wiring, are still framework-owned.

Example custom JWT response override:

```typescript
import type { Middleware } from '@zintrust/core';

export const JwtAuthOverrideMiddleware: Middleware = async (req, res, next) => {
  const authorization = req.getHeader('authorization');

  if (typeof authorization !== 'string' || authorization.trim() === '') {
    res.setStatus(401).json({
      error: {
        code: 'AUTH_TOKEN_INVALID',
        message: 'Invalid or expired token',
      },
    });
    return;
  }

  await next();
};
```

Register it with the built-in key name:

```typescript
import type { MiddlewaresType } from '@zintrust/core';
import { JwtAuthOverrideMiddleware } from '@app/Middleware/JwtAuthOverrideMiddleware';

export default {
  route: {
    jwt: JwtAuthOverrideMiddleware,
  },
} as MiddlewaresType;
```

With that in place, existing route metadata such as `middleware: ['jwt', 'auth']` keeps working, but the app-owned `jwt` middleware controls the response shape.

## Built-In Failure Responders

When you only need to customize the failure payload, you do not need to replace the middleware anymore. Fresh apps can register responder hooks in `config/middleware.ts`, and the built-in middleware keeps its verification, throttling, validation, or error-handling logic while delegating the response body to your app code.

Supported responder keys match the built-in keyed middleware that write responses: `auth`, `jwt`, `bulletproof`, `csrf`, `rateLimit`, `fillRateLimit`, `authRateLimit`, `userMutationRateLimit`, `error`, and the built-in validation keys.

Fresh apps can keep the responder in a dedicated module such as `app/Middleware/AuthFailureResponder.ts` and import it into `config/middleware.ts`.

Example responder:

```typescript
import type { MiddlewaresType } from '@zintrust/core';
import { authFailureResponder } from '@app/Middleware/AuthFailureResponder';

export default {
  responders: {
    auth: authFailureResponder,
    jwt: authFailureResponder,
    bulletproof: authFailureResponder,
  },
} as MiddlewaresType;
```

Each responder receives the request, the response, and a context object with:

- `middleware`: the built-in middleware key that raised the failure
- `reason`: a stable failure reason such as `missing_authorization_header` or `rate_limit_exceeded`
- `statusCode`: the default HTTP status code
- `message`: the default framework message for that failure
- `body`: the default JSON payload the framework would have returned
- `error`: the original error when one exists
- `requestId`: present for JSON-mode internal error handling

### Stable Reason Values

These `reason` values are stable extension points for app responders:

| Middleware key                                                                                     | Stable `reason` values                                                                                                      |
| -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `auth`                                                                                             | `missing_authorization_header`                                                                                              |
| `jwt`                                                                                              | `missing_authorization_header`, `invalid_authorization_header_format`, `inactive_session`, `expired_token`, `invalid_token` |
| `bulletproof`                                                                                      | `unauthorized`                                                                                                              |
| `csrf`                                                                                             | `invalid_csrf_token`                                                                                                        |
| `rateLimit`, `fillRateLimit`, `authRateLimit`, `userMutationRateLimit`                             | `rate_limit_exceeded`                                                                                                       |
| `validateLogin`, `validateRegister`, `validateUserStore`, `validateUserUpdate`, `validateUserFill` | `validation_error`, `invalid_request_body`, `sanitization_error`                                                            |
| `error`                                                                                            | `unhandled_exception`                                                                                                       |

`bulletproof` currently collapses its internal auth failure branches to `unauthorized`. If you need different payloads for different bulletproof failure causes today, continue overriding the middleware key itself instead of using a responder.

Use keyed middleware replacement when you need to change the middleware behavior itself. Use responders when you only need to reshape the payload.

## Typed Middleware Registry

Route middleware is still referenced by string key at runtime, but you can type-check those keys at build time.

The built-in registry is defined in `src/config/middleware.ts`:

```typescript
export const MiddlewareKeys = Object.freeze({
  log: true,
  error: true,
  security: true,
  rateLimit: true,
  fillRateLimit: true,
  csrf: true,
  auth: true,
  jwt: true,
  validateLogin: true,
  validateRegister: true,
});

export type MiddlewareKey = keyof typeof MiddlewareKeys;
```

`MiddlewareKey` is the compile-time union of allowed framework middleware keys. `MiddlewareKeys` is the runtime source of truth for those keys.

Without typing, a typo can ship unnoticed:

```typescript
Router.get(router, '/admin', handler, {
  middleware: ['autth', 'jwt'],
});
```

With typing, the same mistake becomes a compile-time error:

```typescript
import { Router, type MiddlewareKey } from '@zintrust/core';

Router.get<MiddlewareKey>(router, '/admin', handler, {
  middleware: ['auth', 'jwt'],
});
```

## Route Usage Patterns

### Basic Routes

```typescript
import { Router, type IRouter, type MiddlewareKey } from '@zintrust/core';

export function registerRoutes(router: IRouter): void {
  Router.get<MiddlewareKey>(
    router,
    '/profile',
    async (_req, res) => {
      res.json({ ok: true });
    },
    {
      middleware: ['jwt'],
    }
  );

  Router.post<MiddlewareKey>(
    router,
    '/admin/users',
    async (_req, res) => {
      res.setStatus(201).json({ id: 1 });
    },
    {
      middleware: ['jwt', 'auth', 'rateLimit'],
    }
  );
}
```

### Resource Routes

```typescript
import { Router, type MiddlewareKey } from '@zintrust/core';

const usersMiddleware = ['jwt', 'auth'] satisfies MiddlewareKey[];

Router.resource<MiddlewareKey>(router, '/api/v1/users', UserController, {
  middleware: usersMiddleware,
  meta: { tags: ['Users'] },
});
```

### Route Groups

```typescript
import { Router, type MiddlewareKey } from '@zintrust/core';

const adminMiddleware = ['jwt', 'auth'] satisfies MiddlewareKey[];

Router.group(router, '/admin', (groupRouter) => {
  Router.get<MiddlewareKey>(groupRouter, '/dashboard', AdminController.dashboard, {
    middleware: adminMiddleware,
  });

  Router.get<MiddlewareKey>(groupRouter, '/users', AdminController.users, {
    middleware: adminMiddleware,
  });
});
```

Validation middleware usually follows a `validate*` naming convention:

```typescript
Router.post<MiddlewareKey>(
  router,
  '/api/v1/auth/register',
  async (_req, res) => {
    res.json({ ok: true });
  },
  {
    middleware: ['validateRegister'],
  }
);
```

## Programmatic Registration

If you need a middleware instance that is created dynamically at boot time, register it with the kernel and then reference it by key from routes.

```typescript
import { RateLimiter, type IKernel, Router } from '@zintrust/core';
import type { IRouter } from '@zintrust/core';

export function registerRoutes(router: IRouter, kernel: IKernel): void {
  const strictRateLimit = RateLimiter.create({
    windowMs: 60_000,
    max: 3,
    message: 'Too many attempts. Please try again later.',
  });

  kernel.registerRouteMiddleware('strictLimit', strictRateLimit);

  Router.post(router, '/api/v1/auth/login', authController.login, {
    middleware: ['strictLimit', 'validateLogin'],
  });

  Router.post(router, '/api/v1/auth/register', authController.register, {
    middleware: ['authRateLimit', 'validateRegister'],
  });
}
```

Per-route middleware can override the default middleware of the same concern. Multiple rate limiters can coexist, and each keeps its own state unless you back it with a shared store such as Redis.

## Governance Tests

If you want CI to enforce middleware correctness across the whole route tree, add an architecture test that checks every route middleware key against `MiddlewareKeys`.

```typescript
import { MiddlewareKeys, RouteRegistry, Router } from '@zintrust/core';
import { beforeEach, describe, expect, it } from 'vitest';

import { registerRoutes } from '@routes/api';

describe('Architecture: route middleware registry', () => {
  beforeEach(() => {
    RouteRegistry.clear();
  });

  it('ensures all route middleware names exist in MiddlewareKeys', () => {
    const router = Router.createRouter();
    registerRoutes(router);

    const allowed = new Set(Object.keys(MiddlewareKeys));
    const unknown: Array<{ method: string; path: string; middleware: string }> = [];

    for (const route of RouteRegistry.list()) {
      for (const name of route.middleware ?? []) {
        if (!allowed.has(name)) {
          unknown.push({ method: route.method, path: route.path, middleware: name });
        }
      }
    }

    expect(unknown).toEqual([]);
  });
});
```

Framework contributors can also keep the compile-time and runtime registries aligned with a small sync test:

```typescript
import { MiddlewareKeys, middlewareConfig } from '@zintrust/core';
import { describe, expect, it } from 'vitest';

describe('Middleware Registry', () => {
  it('keeps type and runtime registries aligned', () => {
    const typeKeys = Object.keys(MiddlewareKeys);
    const runtimeKeys = Object.keys(middlewareConfig.route);

    expect(typeKeys.sort()).toEqual(runtimeKeys.sort());
  });
});
```

## Best Practices

- Prefer `satisfies MiddlewareKey[]` or router generics for route metadata.
- Keep project-only middleware keys local to the app by extending `MiddlewareKey` with a union type instead of modifying framework types.
- Use `global` only for middleware that truly belongs on every request.
- Keep reusable route middleware presets in application code.

Example preset:

```typescript
import type { MiddlewareKey } from '@zintrust/core';

export const MiddlewarePresets = {
  authenticated: ['jwt', 'auth'] satisfies MiddlewareKey[],
  admin: ['jwt', 'auth', 'rateLimit'] satisfies MiddlewareKey[],
} as const;
```

## Built-In Middleware

Common built-in middleware includes:

- `log`
- `error`
- `security`
- `rateLimit`
- `fillRateLimit`
- `csrf`
- `auth`
- `jwt`
- `validate*` project validation middleware such as `validateLogin` and `validateRegister`

Related concrete handlers include `CsrfMiddleware`, `JsonBodyParser`, and `CorsMiddleware`.

## Troubleshooting

### TypeScript Is Not Catching Invalid Names

The most common cause is that the middleware array widened to `string[]`.

Fix it by using router generics or `satisfies`:

```typescript
import { Router, type MiddlewareKey } from '@zintrust/core';

const middleware = ['jwt', 'auth'] satisfies MiddlewareKey[];

Router.get(router, '/admin', handler, {
  middleware,
});
```

### Middleware Is Not Executing

If the middleware key is unknown, the current kernel drops it silently. Use typed route metadata and a governance test so bad keys fail in CI instead of being discovered in production.

## See Also

- [Route Metadata](./route-metadata.md)
- [Request Pipeline](./request-pipeline.md)
- [Request typing & validation](./request-typing-and-validation.md)
