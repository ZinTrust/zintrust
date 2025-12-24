# Middleware

Middleware provide a convenient mechanism for inspecting and filtering HTTP requests entering your application.

## Defining Middleware

Middleware are stored in `app/Middleware`. You can generate one using:

```bash
zin add middleware AuthMiddleware
```

A middleware must implement the `Middleware` interface:

```typescript
import type { Middleware } from '@middleware/MiddlewareStack';

export const authMiddleware: Middleware = async (req, res, next) => {
  if (!req.getHeader('authorization')) {
    res.setStatus(401).json({ error: 'Unauthorized' });
    return;
  }

  await next();
};
```

## Registering Middleware

Middleware are registered in the `src/boot/bootstrap.ts` or directly in route groups.

### Global Middleware

Global middleware run on every request to your application.

### Route Middleware

You can assign middleware to specific routes or groups:

```typescript
router.get('/admin', 'AdminController@index', { middleware: ['auth', 'admin'] });
```

## Built-in Middleware

Zintrust comes with several built-in middleware:

- `CsrfMiddleware`: Protects against cross-site request forgery.
- `JsonBodyParser`: Parses JSON request bodies.
- `CorsMiddleware`: Handles Cross-Origin Resource Sharing.
