# Route Metadata

**Route metadata** is structured information attached to routes that describes their documented behavior and contracts.

In ZinTrust core, metadata primarily powers **OpenAPI generation**. It is also available in the in-memory route registry so applications (or additional tooling) can inspect it.

## Why Use Route Metadata?

Route metadata solves several challenges:

1. **Documentation Generation**: Generate OpenAPI/Swagger docs from code
2. **API Contracts**: Define request/response schemas alongside route handlers
3. **IDE Support**: Improve autocomplete by keeping route docs close to handlers

Notes:

- Metadata is **documentation**, not enforcement. Validation is enforced by middleware.
- ZinTrust does not ship built-in test generation or client generation; those can be done downstream (typically from OpenAPI).

## Architecture

### Storage Location

Route metadata is managed by two key modules:

**`src/routing/RouteRegistry.ts`**

- Stores all route registrations in memory
- Provides `RouteMeta` and `RouteMetaInput` types
- Normalizes metadata via `normalizeRouteMeta()`

**`src/routing/Router.ts`**

- Records metadata when routes are registered
- Attaches metadata to route objects for runtime access

### Metadata Flow

```
Route Registration → normalizeRouteMeta() → RouteRegistry → OpenAPI Generator
                                                         → Documentation
                                                         → Custom tooling (app-owned)
```

## Metadata Structure

### Full Schema

```ts
type RouteMeta = {
  // Description
  summary?: string; // Short description (one line)
  description?: string; // Detailed description (markdown)
  tags?: readonly string[]; // Logical grouping (e.g., ['Users', 'Admin'])

  // Request schema
  request?: {
    bodySchema?: ValidationSchema; // Request body validation
    querySchema?: ValidationSchema; // Query parameters
    paramsSchema?: ValidationSchema; // Path parameters
    headersSchema?: ValidationSchema; // Required headers
  };

  // Response schema
  response?: {
    status?: number; // Expected HTTP status (default: 200)
    schema?: unknown; // Response body shape (OpenAPI schema or Zod)
  };
};
```

### Input Types

ZinTrust supports two formats for convenience:

**Full Format**

```ts
meta: {
  summary: 'Create user',
  request: {
    bodySchema: Schema.create().required('email'),
  },
  response: {
    status: 201,
    schema: { type: 'object' },
  },
}
```

**Shorthand Format** (auto-normalized)

```ts
meta: {
  summary: 'Create user',
  requestSchema: Schema.create().required('email'),  // → request.bodySchema
  responseSchema: { type: 'object' },                // → response.schema
  responseStatus: 201,                                // → response.status
}
```

## Basic Usage

### Simple Route with Metadata

```ts
import { Router, type IRouter, Schema } from '@zintrust/core';

export function registerRoutes(router: IRouter): void {
  Router.get(
    router,
    '/api/v1/users/:id',
    async (req, res) => {
      const id = req.getParam('id');
      // ... fetch user
      res.json({ user: { id, name: 'John' } });
    },
    {
      meta: {
        summary: 'Get user by ID',
        description: 'Fetches a single user record by their unique identifier',
        tags: ['Users'],
      },
    }
  );
}
```

### POST with Request Validation

```ts
Router.post(
  router,
  '/api/v1/users',
  async (req, res) => {
    const body = await req.json();
    // ... create user
    res.setStatus(201).json({ ok: true, id: 123 });
  },
  {
    meta: {
      summary: 'Create user',
      description: 'Creates a new user account with email and password',
      tags: ['Users', 'Authentication'],

      request: {
        bodySchema: Schema.create()
          .required('email')
          .email('email')
          .required('password')
          .string('password')
          .minLength('password', 8),
      },

      response: {
        status: 201,
        schema: {
          type: 'object',
          properties: {
            ok: { type: 'boolean' },
            id: { type: 'integer' },
          },
        },
      },
    },
  }
);
```

## Advanced Examples

### Complete CRUD Resource

```ts
import { Schema } from '@zintrust/core';

const userSchema = Schema.typed\<{
  name: string;
  email: string;
  role: 'user' | 'admin';
}>()
  .required('name')
  .string('name')
  .minLength('name', 1)
  .required('email')
  .email('email')
  .required('role')
  .in('role', ['user', 'admin']);

const userIdSchema = Schema.create().required('id').integer('id').positiveNumber('id');

// List users
Router.get(router, '/api/v1/users', UserController.index, {
  meta: {
    summary: 'List users',
    description: 'Returns a paginated list of users',
    tags: ['Users'],

    request: {
      querySchema: Schema.create()
        .integer('page')
        .integer('limit')
        .in('sort', ['name', 'email', 'createdAt']),
    },

    response: {
      status: 200,
      schema: {
        type: 'object',
        properties: {
          data: {
            type: 'array',
            items: { type: 'object' },
          },
          pagination: {
            type: 'object',
            properties: {
              page: { type: 'integer' },
              perPage: { type: 'integer' },
              total: { type: 'integer' },
            },
          },
        },
      },
    },
  },
});

// Get user
Router.get(router, '/api/v1/users/:id', UserController.show, {
  meta: {
    summary: 'Get user',
    tags: ['Users'],

    request: {
      paramsSchema: userIdSchema,
    },

    response: {
      status: 200,
      schema: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          name: { type: 'string' },
          email: { type: 'string' },
          role: { type: 'string', enum: ['user', 'admin'] },
        },
      },
    },
  },
});

// Create user
Router.post(router, '/api/v1/users', UserController.store, {
  meta: {
    summary: 'Create user',
    tags: ['Users'],
    request: { bodySchema: userSchema },
    response: { status: 201 },
  },
});

// Update user
Router.put(router, '/api/v1/users/:id', UserController.update, {
  meta: {
    summary: 'Update user',
    tags: ['Users'],
    request: {
      paramsSchema: userIdSchema,
      bodySchema: userSchema,
    },
    response: { status: 200 },
  },
});

// Delete user
Router.del(router, '/api/v1/users/:id', UserController.destroy, {
  meta: {
    summary: 'Delete user',
    tags: ['Users'],
    request: { paramsSchema: userIdSchema },
    response: { status: 204 },
  },
});
```

### Headers and Authentication

```ts
Router.post(router, '/api/v1/orders', OrderController.create, {
  meta: {
    summary: 'Create order',
    description: 'Creates a new order. Requires authentication.',
    tags: ['Orders'],

    request: {
      headersSchema: Schema.create().required('authorization').string('authorization'),
      bodySchema: Schema.create()
        .required('items')
        .array('items')
        .required('total')
        .number('total'),
    },

    response: {
      status: 201,
      schema: {
        type: 'object',
        properties: {
          orderId: { type: 'string' },
          status: { type: 'string', enum: ['pending', 'confirmed'] },
        },
      },
    },
  },
});
```

## Resource Routes with Metadata

Apply metadata to entire resource controllers:

```ts
Router.resource(
  router,
  '/api/v1/posts',
  {
    index: PostController.index,
    store: PostController.store,
    show: PostController.show,
    update: PostController.update,
    destroy: PostController.destroy,
  },
  {
    // Base metadata for all actions
    meta: {
      tags: ['Posts'],
    },

    // Override for specific actions
    store: {
      meta: {
        summary: 'Create post',
        request: {
          bodySchema: Schema.create()
            .required('title')
            .string('title')
            .required('content')
            .string('content'),
        },
        response: { status: 201 },
      },
    },

    update: {
      meta: {
        summary: 'Update post',
        request: {
          paramsSchema: Schema.create().required('id').integer('id'),
          bodySchema: Schema.create().string('title').string('content'),
        },
      },
    },
  }
);
```

## Metadata Normalization

ZinTrust normalizes metadata automatically:

```ts
// Input (shorthand)
const input = {
  summary: 'Get users',
  requestSchema: userSchema, // → request.bodySchema
  responseSchema: { type: 'array' }, // → response.schema
  responseStatus: 200, // → response.status
};

// After normalization
const normalized = {
  summary: 'Get users',
  request: {
    bodySchema: userSchema,
  },
  response: {
    status: 200,
    schema: { type: 'array' },
  },
};
```

This normalization happens automatically in `Router.registerRoute()`.

## Using Metadata for Documentation

### OpenAPI Generation

Metadata automatically flows into OpenAPI specs:

```ts
import { OpenApiGenerator, RouteRegistry } from '@zintrust/core';

const spec = OpenApiGenerator.generate(RouteRegistry.list(), {
  title: 'My API',
  version: '1.0.0',
  serverUrl: 'https://api.example.com',
});

// Generates OpenAPI 3.0 JSON with all route metadata
```

See [OpenAPI](openapi) for details.

### Swagger UI

Route metadata appears in Swagger UI:

- `summary` → Operation title
- `description` → Operation description
- `tags` → Groups operations
- `request.*` → Parameters and request body
- `response.*` → Response schema

## Best Practices

### 1. Always Add Summaries

```ts
// ❌ Avoid: No description
Router.get(router, '/users', handler);

// ✅ Prefer: Clear summary
Router.get(router, '/users', handler, {
  meta: { summary: 'List users' },
});
```

### 2. Use Tags for Organization

```ts
// Group related routes
meta: {
  tags: ['Users', 'Admin'], // Appears in both sections
}
```

### 3. Reuse Schemas

```ts
// Define once
const userCreateSchema = Schema.typed\<UserCreate>()
  .required('email')
  .email('email')
  .required('password')
  .minLength('password', 8);

// Reuse everywhere
Router.post(router, '/users', handler, {
  meta: { request: { bodySchema: userCreateSchema } },
});

Router.post(router, '/admin/users', handler, {
  meta: { request: { bodySchema: userCreateSchema } },
});
```

### 4. Document Error Responses

While ZinTrust only stores one response schema, document errors in description:

```ts
meta: {
  summary: 'Get user',
  description: `
Returns a user by ID.

**Errors:**
- 404: User not found
- 401: Unauthorized
- 403: Forbidden
  `,
}
```

### 5. Keep Response Schemas Accurate

```ts
// ❌ Avoid: Inaccurate schema
response: {
  schema: { type: 'object' }, // Too vague
}

// ✅ Prefer: Precise schema
response: {
  schema: {
    type: 'object',
    properties: {
      id: { type: 'integer' },
      name: { type: 'string' },
      createdAt: { type: 'string', format: 'date-time' },
    },
    required: ['id', 'name'],
  },
}
```

## Testing Metadata

```ts
import { RouteRegistry } from '@zintrust/core';
import { describe, expect, it } from 'vitest';

describe('Route Metadata', () => {
  it('should have metadata for all public routes', () => {
    const routes = RouteRegistry.list();
    const publicRoutes = routes.filter((r) => r.path.startsWith('/api'));

    for (const route of publicRoutes) {
      expect(route.meta?.summary).toBeDefined();
      expect(route.meta?.tags).toBeDefined();
    }
  });
});
```

## See Also

- [OpenAPI](openapi) - Generate OpenAPI specs from metadata
- [Route Registry](route-registry) - In-memory route storage
- [Validation](validation) - Schema-based validation
- [Swagger UI](swagger-ui) - Interactive API documentation
