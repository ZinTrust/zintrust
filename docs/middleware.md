# Middleware

Middleware provide a convenient mechanism for inspecting and filtering HTTP requests entering your application.

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

## Defining Middleware

Middleware are stored in `app/Middleware`. You can generate one using:

```bash
zin add middleware AuthMiddleware
```

A middleware must implement the `Middleware` interface:

```typescript
import type { Middleware } from '@zintrust/core';

export const authMiddleware: Middleware = async (req, res, next) => {
  if (!req.getHeader('authorization')) {
    res.setStatus(401).json({ error: 'Unauthorized' });
    return;
  }

  await next();
};
```

## Registering Middleware

Middleware are registered in the framework middleware config and applied by the HTTP Kernel. Routes attach middleware by name via route metadata.

### Global Middleware

Global middleware run on every request to your application.

### Route Middleware

You can assign middleware to specific routes or groups:

```typescript
import { Router } from '@zintrust/core';
import type { IRouter } from '@zintrust/core';

export function registerRoutes(router: IRouter): void {
  Router.get(router, '/admin', async (_req, res) => res.json({ ok: true }), {
    middleware: ['auth', 'jwt'],
  });
}
```

Validation can also be expressed as route middleware. A common convention is to name them with a `validate*` prefix:

```typescript
Router.post(router, '/api/v1/auth/register', async (_req, res) => res.json({ ok: true }), {
  middleware: ['validateRegister'],
});
```

## Built-in Middleware

ZinTrust comes with several built-in middleware:

- `CsrfMiddleware`: Protects against cross-site request forgery.
- `JsonBodyParser`: Parses JSON request bodies.
- `CorsMiddleware`: Handles Cross-Origin Resource Sharing.
- `auth`: Requires an `Authorization` header.
- `jwt`: Validates a `Bearer` token and attaches the user context.
- `validate*`: Request validation middleware (project-configured; typically returns 422 with field errors).
