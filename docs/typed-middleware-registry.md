# Typed Middleware Registry

ZinTrust route middleware is referenced by **string keys**. The typed middleware registry is the combination of:

- A canonical list of allowed keys (`MiddlewareKeys` → `MiddlewareKey`)
- Route APIs that let you type-check `middleware: [...]` at compile time
- A governance test pattern to catch drift in CI

This prevents the most common failure mode with stringly-typed middleware: **a typo that silently disables middleware at runtime**.

## Problem

Traditional middleware systems use string names, so typos are easy to ship:

```ts
Router.get(router, '/admin', handler, {
  // typo: 'autth'
  middleware: ['autth', 'jwt'],
});
```

In the current ZinTrust kernel, unknown middleware keys do not cause a hard failure; they are simply not executed.

## Solution

Use TypeScript to validate middleware keys at build time:

```ts
// TypeScript error at compile-time
Router.get\<MiddlewareKey>(router, '/admin', handler, {
  middleware: ['autth'], // TS Error: not assignable to MiddlewareKey
});

// Valid names pass type-checking
Router.get\<MiddlewareKey>(router, '/admin', handler, {
  middleware: ['auth', 'jwt'], // OK!
});
```

## Architecture

### Registry Definition

Located in `src/config/middleware.ts`:

```ts
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

Notes:

- `MiddlewareKey` is the compile-time union of allowed keys.
- `MiddlewareKeys` is the runtime canonical list (values are not important; treat it as a set of keys).

### Type Safety Flow

```
Developer writes route
       ↓
TypeScript validates middleware array
       ↓
   [Compile-time check]
       ↓
   ✓ Valid → Build succeeds
   ✗ Invalid → TypeScript error
       ↓
Runtime: middleware already validated
```

## Usage

### Basic Routes

```ts
import { Router, type IRouter, type MiddlewareKey } from '@zintrust/core';

export function registerRoutes(router: IRouter): void {
  // Single middleware
  Router.get\<MiddlewareKey>(
    router,
    '/profile',
    async (_req, res) => {
      res.json({ ok: true });
    },
    { middleware: ['jwt'] }
  );

  // Multiple middleware
  Router.post\<MiddlewareKey>(
    router,
    '/admin/users',
    async (_req, res) => {
      res.setStatus(201).json({ id: 1 });
    },
    { middleware: ['jwt', 'auth', 'rateLimit'] }
  );
}
```

### Resource Routes

```ts
import { Router, type MiddlewareKey } from '@zintrust/core';

const usersMiddleware = ['jwt', 'auth'] satisfies MiddlewareKey[];

Router.resource\<MiddlewareKey>(router, '/api/v1/users', UserController, {
  // Applied to all CRUD
  middleware: usersMiddleware,
  meta: { tags: ['Users'] },
});
```

### Route Groups

```ts
import { Router, type MiddlewareKey } from '@zintrust/core';

const adminMiddleware = ['jwt', 'auth'] satisfies MiddlewareKey[];

Router.group(router, '/admin', (groupRouter) => {
  Router.get\<MiddlewareKey>(groupRouter, '/dashboard', AdminController.dashboard, {
    middleware: adminMiddleware,
  });
  Router.get\<MiddlewareKey>(groupRouter, '/users', AdminController.users, {
    middleware: adminMiddleware,
  });
});
```

## Governance Test (recommended)

Even if not every route uses generics, you can enforce correctness in CI by verifying that every route’s `middleware` list contains only keys from `MiddlewareKeys`.

```ts
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
    const unknown: Array\<{ method: string; path: string; middleware: string }> = [];

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

## Extending the Registry

In the current design, the route middleware registry is **framework-owned**:

- Route middleware is resolved from `middlewareConfig.route`, which is created and frozen inside the framework.
- `MiddlewareKey` is derived from that framework-owned registry.

If you are contributing to the framework and need to add a new named middleware:

1. Update the `SharedMiddlewares` type in `src/config/middleware.ts`
2. Add the new key to `MiddlewareKeys`
3. Add the new middleware factory to `createSharedMiddlewares()`

For application-level “presets” (reusable combinations), keep it in your application code:

```ts
import type { MiddlewareKey } from '@zintrust/core';

export const MiddlewarePresets = {
  authenticated: ['jwt', 'auth'] satisfies MiddlewareKey[],
  admin: ['jwt', 'auth', 'rateLimit'] satisfies MiddlewareKey[],
} as const;
```

## Best Practices

### 1. Prefer `satisfies MiddlewareKey[]` (or Router generics)

```ts
import { Router, type MiddlewareKey } from '@zintrust/core';

// ✅ Type-checked without generics
const mw = ['jwt', 'auth'] satisfies MiddlewareKey[];
Router.get(router, '/admin', handler, { middleware: mw });

// ✅ Also valid (generic typing)
Router.get\<MiddlewareKey>(router, '/admin', handler, { middleware: ['jwt', 'auth'] });
```

### 2. Keep type keys and runtime keys aligned (framework contributors)

The framework’s registry is intended to match the route middleware map. You can enforce this with a simple test:

```ts
import { MiddlewareKeys, middlewareConfig } from '@zintrust/core';

describe('Middleware Registry', () => {
  it('should sync type and runtime registries', () => {
    const typeKeys = Object.keys(MiddlewareKeys);
    const runtimeKeys = Object.keys(middlewareConfig.route);

    expect(typeKeys.sort()).toEqual(runtimeKeys.sort());
  });
});
```

### 3. Add a governance test for routes

If you want to enforce correctness across your route tree (even when not using generics everywhere), add an architecture test that inspects `RouteRegistry` and checks middleware names against `MiddlewareKeys`.

## Troubleshooting

### TypeScript Not Catching Invalid Names

**Cause**: the `middleware` array widened to `string[]`.

**Solutions**:

- Add the generic: `Router.get\<MiddlewareKey>(...)`
- Or validate the array with `satisfies MiddlewareKey[]`

```ts
const middleware = ['jwt', 'auth'] satisfies MiddlewareKey[];
Router.get(router, '/path', handler, { middleware });
```

### Middleware not executing

If the middleware key is unknown, the kernel will silently drop it. Use compile-time validation and/or the architecture test to prevent this from shipping.

## See Also

- [Middleware](middleware) - Middleware system overview
- [Route Metadata](route-metadata) - Route metadata
- [Request Pipeline](request-pipeline) - Execution order
