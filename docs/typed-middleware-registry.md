# Typed Middleware Registry

**Typed Middleware Registry** ensures middleware names are validated at compile-time using TypeScript's type system, preventing typos and configuration errors before runtime.

## Problem

Traditional middleware systems use string names, prone to typos:

```ts
// Runtime error: 'autth' middleware not found
Router.get(router, '/admin', handler, {
  middleware: ['autth', 'jwt'],  // Typo discovered at runtime!
});
```

## Solution

TypeScript generics + `keyof` create compile-time validation:

```ts
// TypeScript error at compile-time
Router.get<MiddlewareKey>(router, '/admin', handler, {
  middleware: ['autth'],  // TS Error: not assignable to MiddlewareKey
});

// Valid names pass type-checking
Router.get<MiddlewareKey>(router, '/admin', handler, {
  middleware: ['auth', 'jwt'],  // OK!
});
```

## Architecture

### Registry Definition

Located in `src/config/middleware.ts`:

```ts
/**
 * Canonical registry of middleware keys
 */
export const MiddlewareKeys = {
  // Auth
  auth: 'auth',
  jwt: 'jwt',
  'api-key': 'api-key',
  
  // Security
  cors: 'cors',
  helmet: 'helmet',
  csrf: 'csrf',
  rateLimit: 'rateLimit',
  
  // Observability
  logging: 'logging',
  requestId: 'requestId',
  
  // Validation
  validateRequest: 'validateRequest',
  
  // Other
  cache: 'cache',
  compression: 'compression',
} as const;

export type MiddlewareKey = keyof typeof MiddlewareKeys;
```

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
import { Router, type IRouter } from '@routing/Router';
import type { MiddlewareKey } from '@config/middleware';

export function registerRoutes(router: IRouter): void {
  // Single middleware
  Router.get<MiddlewareKey>(
    router,
    '/profile',
    async (req, res) => {
      res.json({ user: req.user });
    },
    { middleware: ['jwt'] }
  );

  // Multiple middleware
  Router.post<MiddlewareKey>(
    router,
    '/admin/users',
    async (req, res) => {
      res.setStatus(201).json({ id: 1 });
    },
    { middleware: ['jwt', 'auth', 'rateLimit'] }
  );
}
```

### Resource Routes

```ts
Router.resource<MiddlewareKey>(
  router,
  '/api/v1/users',
  UserController,
  {
    middleware: ['jwt', 'auth'],  // Applied to all CRUD
    meta: { tags: ['Users'] },
  }
);
```

### Route Groups

```ts
Router.group<MiddlewareKey>(
  router,
  { prefix: '/admin', middleware: ['jwt', 'auth'] },
  (groupRouter) => {
    Router.get(groupRouter, '/dashboard', AdminController.dashboard);
    Router.get(groupRouter, '/users', AdminController.users);
  }
);
```

## Extending the Registry

### Adding Middleware

**Step 1: Add to Type Registry**

```ts
// src/config/middleware.ts
export const MiddlewareKeys = {
  // ... existing
  'tenant-isolation': 'tenant-isolation',
  'audit-log': 'audit-log',
} as const;
```

**Step 2: Add to Runtime Config**

```ts
import { TenantIsolationMiddleware } from '@middleware/TenantIsolationMiddleware';

export const middlewareConfig = {
  route: {
    // ... existing
    'tenant-isolation': TenantIsolationMiddleware,
    'audit-log': AuditLogMiddleware,
  },
};
```

**Step 3: Use in Routes**

```ts
Router.get<MiddlewareKey>(
  router,
  '/api/v1/data',
  handler,
  { middleware: ['jwt', 'tenant-isolation'] }
);
```

### Middleware Presets

Create reusable combinations:

```ts
// src/config/middleware-presets.ts
import type { MiddlewareKey } from '@config/middleware';

export const MiddlewarePresets = {
  public: [] as MiddlewareKey[],
  authenticated: ['jwt', 'auth'] as MiddlewareKey[],
  admin: ['jwt', 'auth', 'rateLimit'] as MiddlewareKey[],
  api: ['requestId', 'logging', 'cors'] as MiddlewareKey[],
  highSecurity: ['jwt', 'auth', 'csrf', 'helmet'] as MiddlewareKey[],
} as const;

// Usage
Router.post<MiddlewareKey>(
  router,
  '/admin/users',
  handler,
  { middleware: MiddlewarePresets.admin }
);
```

## Best Practices

### 1. Always Use Generic Parameter

```ts
// ❌ Bad: No type safety
Router.get(router, '/admin', handler, {
  middleware: ['autth'],  // No error!
});

// ✅ Good: Type-safe
Router.get<MiddlewareKey>(router, '/admin', handler, {
  middleware: ['auth'],
});
```

### 2. Keep Registry Synchronized

Test sync in test suite:

```ts
import { MiddlewareKeys, middlewareConfig } from '@config/middleware';

describe('Middleware Registry', () => {
  it('should sync type and runtime registries', () => {
    const typeKeys = Object.keys(MiddlewareKeys);
    const runtimeKeys = Object.keys(middlewareConfig.route);
    
    expect(typeKeys.sort()).toEqual(runtimeKeys.sort());
  });
});
```

### 3. Document Middleware

Add JSDoc comments:

```ts
export const MiddlewareKeys = {
  /** Validates JWT from Authorization header */
  jwt: 'jwt',
  
  /** Checks user permissions */
  auth: 'auth',
  
  /** Rate limits by IP */
  rateLimit: 'rateLimit',
} as const;
```

## Troubleshooting

### TypeScript Not Catching Invalid Names

**Cause**: Missing generic parameter

**Solution**: Add `<MiddlewareKey>`:

```ts
Router.get<MiddlewareKey>(router, '/path', handler, config);
//         ^^^^^^^^^^^^^^
```

### Runtime Error for Valid Name

**Cause**: In type registry but not runtime config

**Solution**: Add to `middlewareConfig.route`:

```ts
export const middlewareConfig = {
  route: {
    'my-middleware': MyMiddleware,  // Add this
  },
};
```

## See Also

- [Middleware](middleware) - Middleware system overview
- [Route Metadata](route-metadata) - Route metadata
- [Request Pipeline](request-pipeline) - Execution order
