# Request

This page covers request typing, validation, and the unified request data API in ZinTrust.

## Request Typing & Validation

ZinTrust validation is **schema-based**, with a fluent API similar to the ORM’s QueryBuilder style.

The goal is to let you:

- validate request inputs consistently
- keep runtime validation close to your route handlers
- get **typed** access to validated values in handlers

Primary implementations:

- `Schema` + `Validator`: `src/validation/Validator.ts`
- `ValidationMiddleware`: `src/middleware/ValidationMiddleware.ts`
- Request types (`IRequest`, `ValidatedRequest`): `src/http/Request.ts`

### Mental model

There are two complementary pieces:

1. **Enforcement** (runtime): middleware validates inputs and populates `req.validated`.
2. **Documentation** (OpenAPI): route metadata can reference schemas so the OpenAPI generator can describe your contract.

They are related, but separate:

- Route metadata does **not** enforce anything.
- Middleware does **not** automatically appear in OpenAPI unless you also provide metadata.

### Schema building blocks

Create a schema with `Schema.create()` (untyped) or `Schema.typed<T>()` (typed):

```ts
import { Schema } from '@zintrust/core';

type RegisterBody = { name: string; email: string; password: string };

export const registerBodySchema = Schema.typed<RegisterBody>()
  .required('name')
  .string('name')
  .minLength('name', 1)
  .required('email')
  .email('email')
  .required('password')
  .string('password')
  .minLength('password', 8);
```

Notes:

- Schemas are **field-rule** based (e.g. `required`, `string`, `email`, `minLength`).
- `Schema.typed<T>()` does not auto-generate rules from `T`. It just attaches a compile-time “shape” to the schema so middleware can infer `req.validated.*` types.

### Enforcement with ValidationMiddleware

ZinTrust provides helpers to validate different request parts:

- `ValidationMiddleware.createBody(schema)` — validates request body (skips `GET` and `DELETE`)
- `ValidationMiddleware.createQuery(schema)` — validates parsed query object
- `ValidationMiddleware.createParams(schema)` — validates route params

On success, middleware stores the validated objects under `req.validated`.

#### Body validation behavior

`createBody` validates `req.body` for most methods, but deliberately **skips** validation for `GET` and `DELETE`.

On success:

- `req.validated.body` is set
- `next()` is called

On failure:

- response is sent immediately
- handlers after the middleware will not run

#### Error responses

Validation errors are serialized by `ValidationMiddleware`:

- If the thrown error has `toObject()`, it responds `422` with `{ errors: <toObject()> }`.
- Otherwise it responds `400` with `{ error: "Invalid request body" }`.

This means:

- your handler can treat “I have validated input” as a strong precondition
- clients should expect `422` for schema failures

### Typed validated access in handlers

The request type includes a `ValidatedRequest<TBody, TQuery, TParams, THeaders>` helper type.

If your route ensures the validations ran, you can type your handler accordingly.

Example pattern:

```ts
import type { ValidatedRequest, IResponse } from '@zintrust/core';

type RegisterBody = { name: string; email: string; password: string };

export async function registerHandler(
  req: ValidatedRequest<RegisterBody>,
  res: IResponse
): Promise<void> {
  const { email, password, name } = req.validated.body;
  // ...
  res.json({ ok: true });
}
```

Important: `ValidatedRequest<...>` is a TypeScript type only. You must ensure middleware actually sets the validated fields before using it.

### Recommended runtime-safe access (no casting)

If you want a simple guard without casting `ValidatedRequest`, use the core helper:

```ts
import { getValidatedBody, type IRequest, type IResponse, getString } from '@zintrust/core';

export async function registerHandler(req: IRequest, res: IResponse): Promise<void> {
  const body = getValidatedBody<Record<string, unknown>>(req);
  if (!body) {
    return res.status(500).json({ error: 'Internal server error' });
  }

  const email = getString(body['email']);
  // ...
}
```

This keeps handler code consistent across body/query/params/headers via `ValidationHelper`.

### Recommended wiring pattern (this repo)

This repo’s default middleware config demonstrates the intended approach in `src/config/middleware.ts`:

- Define shared middleware instances (logging, auth, validation, etc.).
- Export a `middlewareConfig` whose `route` section contains named middleware.
- Attach middleware to routes by name.

Example (simplified):

```ts
validateRegister: ValidationMiddleware.createBody(registerBodySchema);
```

Then on a route:

```ts
Router.post(router, '/api/v1/auth/register', registerHandler, {
  middleware: ['validateRegister'],
});
```

### Route metadata vs middleware (OpenAPI)

If you want OpenAPI docs to reflect the same schemas you enforce, attach schemas in route metadata.

Example:

```ts
Router.post(router, '/api/v1/auth/register', registerHandler, {
  middleware: ['validateRegister'],
  meta: {
    request: { bodySchema: registerBodySchema },
    response: { status: 200 },
  },
});
```

Keep in mind:

- middleware controls enforcement (`req.validated.*`)
- metadata controls documentation (`/openapi.json`)

### Advanced notes

- `Validator.validate(data, schema)` throws a structured validation error (see `src/validation/ValidationError.ts`).
- `Validator.isValid(data, schema)` returns boolean and logs errors (useful in some internal flows, less ideal for HTTP).
- Query parsing yields `Record<string, string | string[]>`; validate and then read `req.validated.query` for normalized access.

## Unified Data API (`req.data()`)

ZinTrust provides a unified, priority-based API for accessing request data, eliminating the confusion between body parameters, query parameters, and route parameters.

### Core API: `req.data()`

The `req.data()` method returns a single object containing all input data, merged with strict precedence.

#### Precedence Rules (High to Low)

1. **Body** (POST/PUT/PATCH payload) - Highest priority
2. **Path Parameters** (`/users/:id`) - Medium priority
3. **Query Parameters** (`?filter=active`) - Lowest priority

**Why?** This ensures that secure payload data (like a user ID in the body) cannot be overridden by a URL query parameter spoofing it.

### Usage

```typescript
// GET /workers/email-worker?enabled=true
// Route: /workers/:name

async function toggleWorker(req: IRequest, res: IResponse) {
  const data = req.data();

  // input.name comes from Path (:name)
  // input.enabled comes from Query (?enabled=true)
  console.log(data); // { name: 'email-worker', enabled: 'true' }

  // Or use destructing
  const { name, enabled } = req.data();
}
```

### Helper: `req.get()`

For convenience, you can retrieve a specific field directly, with an optional default value.

```typescript
// Type-safe retrieval
const enabled = req.get<boolean>('enabled');

// With default value
const limit = req.get<number>('limit', 10);
```

### Legacy Methods (Deprecated)

The following methods are deprecated and should be replaced:

| Deprecated Method           | Replacement       |
| --------------------------- | ----------------- |
| `req.getParam('id')`        | `req.get('id')`   |
| `req.getQueryParam('sort')` | `req.get('sort')` |
| `req.getBody()`             | `req.data()`      |
| `getParam(req, 'id')`       | `req.get('id')`   |

### Migration Guide

#### 1. Simple Data Access

**Before:**

```typescript
const name = getParam(req, 'name');
const status = req.getQueryParam('status');
```

**After:**

```typescript
const { name, status } = req.data();
```

#### 2. Complex Logic

**Before:**

```typescript
// Complex logic to find where 'enabled' is defined
const body = getBody(req);
const param = req.getQueryParam('enabled');
const enabled = body.enabled !== undefined ? body.enabled : param;
```

**After:**

```typescript
// Automatically handled by precedence rules
const enabled = req.get('enabled');
```

### Performance

The unified data object is **cached per-request**.

- The first call to `req.data()` or `req.get()` performs the merge.
- Subsequent calls return the cached object instantly.
- The cache is automatically invalidated if you manually modify `req.params` or call `req.setBody()`.

### Type Safety

You can use generics with `req.get<T>()` or cast the result of `req.data()`.

```typescript
interface WorkerConfig {
  name: string;
  concurrency: number;
}

const config = req.data() as WorkerConfig;
```

## Complete Examples

### Example 1: Worker Management API

```typescript
import type { IRequest, IResponse } from '@zintrust/core';

/**
 * Toggle worker auto-start
 * Route: POST /api/workers/:name/auto-start
 * Body: { enabled: boolean }
 * Query: ?driver=redis
 */
async function setAutoStart(req: IRequest, res: IResponse): Promise<void> {
  try {
    const data = req.data();

    // Access merged data with proper typing
    const name = data['name'] as string;
    const rawEnabled = data['enabled'] as boolean;

    if (!name) {
      res.setStatus(400).json({ error: 'Worker name is required' });
      return;
    }

    // Handle boolean conversion
    let enabled: boolean;
    if (typeof rawEnabled === 'boolean') {
      enabled = rawEnabled;
    } else {
      const enabledStr = String(rawEnabled).toLowerCase();
      enabled = ['true', '1', 'yes', 'on'].includes(enabledStr);
    }

    // Get driver from query (lower precedence than body)
    const driver = req.get<string>('driver', 'memory');

    await WorkerFactory.setAutoStart(name, enabled, { driver });

    res.json({
      ok: true,
      message: `Worker ${name} auto-start ${enabled ? 'enabled' : 'disabled'}`,
    });
  } catch (error) {
    Logger.error('WorkerController.setAutoStart failed', error);
    res.setStatus(500).json({ error: (error as Error).message });
  }
}
```

### Example 2: User Registration

```typescript
import type { IRequest, IResponse } from '@zintrust/core';
import { ValidationMiddleware } from '@zintrust/core';

// Schema definition
const registerSchema = Schema.typed<{
  name: string;
  email: string;
  password: string;
  acceptTerms: boolean;
}>()
  .required('name')
  .string('name')
  .minLength('name', 2)
  .required('email')
  .email('email')
  .required('password')
  .string('password')
  .minLength('password', 8)
  .required('acceptTerms')
  .boolean('acceptTerms');

// Route with validation
Router.post(router, '/api/users/register', registerHandler, {
  middleware: [ValidationMiddleware.createBody(registerSchema)],
});

/**
 * User registration handler
 * Route: POST /api/users/register
 * Body: { name, email, password, acceptTerms }
 */
async function registerHandler(req: IRequest, res: IResponse): Promise<void> {
  // Using unified data API
  const data = req.data();
  const { name, email, password } = data;

  // Access validated body (type-safe)
  const validatedBody = req.validated.body as {
    name: string;
    email: string;
    password: string;
    acceptTerms: boolean;
  };

  // Business logic
  const user = await UserService.create({
    name: validatedBody.name,
    email: validatedBody.email,
    password: validatedBody.password,
  });

  res.status(201).json({
    ok: true,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
    },
  });
}
```

### Example 3: Search and Filtering

```typescript
/**
 * Search users with filters
 * Route: GET /api/users?q=search&status=active&page=1&limit=10
 */
async function searchUsers(req: IRequest, res: IResponse): Promise<void> {
  const data = req.data();

  // Extract with defaults and typing
  const query = req.get<string>('q', '');
  const status = req.get<string>('status', 'all');
  const page = Math.max(1, req.get<number>('page', 1));
  const limit = Math.min(100, Math.max(1, req.get<number>('limit', 10)));

  // Build search options
  const options = {
    query: query.trim(),
    status: status === 'all' ? undefined : status,
    pagination: {
      page,
      limit,
      offset: (page - 1) * limit,
    },
  };

  const users = await UserService.search(options);
  const total = await UserService.count(options);

  res.json({
    ok: true,
    data: users,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  });
}
```

### Example 4: File Upload with Metadata

```typescript
/**
 * Upload document with metadata
 * Route: POST /api/documents/:categoryId
 * Body: FormData with file + metadata
 */
async function uploadDocument(req: IRequest, res: IResponse): Promise<void> {
  const data = req.data();

  // Get category from URL params
  const categoryId = data['categoryId'] as string;

  // Get metadata from form fields
  const title = req.get<string>('title');
  const description = req.get<string>('description', '');
  const isPublic = req.get<boolean>('isPublic', false);

  // Handle file upload
  if (!req.hasFile('document')) {
    return res.setStatus(400).json({ error: 'No file uploaded' });
  }

  const file = req.file('document');
  if (!file) {
    return res.setStatus(400).json({ error: 'File upload failed' });
  }

  try {
    const document = await DocumentService.create({
      categoryId,
      title: title || file.originalName,
      description,
      isPublic,
      file: {
        name: file.originalName,
        size: file.size,
        mimeType: file.mimeType,
        buffer: file.buffer,
      },
    });

    res.status(201).json({
      ok: true,
      document: {
        id: document.id,
        title: document.title,
        size: document.size,
        url: `/api/documents/${document.id}`,
      },
    });
  } catch (error) {
    Logger.error('Document upload failed', error);
    res.setStatus(500).json({ error: 'Upload failed' });
  }
}
```

### Example 5: API Versioning and Headers

```typescript
/**
 * Versioned API endpoint
 * Route: GET /api/v2/users/:id
 * Headers: X-API-Version, Accept
 */
async function getUserV2(req: IRequest, res: IResponse): Promise<void> {
  const data = req.data();
  const headers = req.headers();

  // Get user ID from params
  const userId = data['id'] as string;

  // Check API version from header
  const apiVersion = headers['x-api-version'] || '2.0';
  const acceptFormat = headers['accept'] || 'application/json';

  // Get optional fields from query
  const include = req.get<string>('include', '');
  const fields = include ? include.split(',') : [];

  const user = await UserService.findById(userId, {
    include: fields,
    version: apiVersion,
  });

  if (!user) {
    return res.setStatus(404).json({ error: 'User not found' });
  }

  // Format response based on Accept header
  if (acceptFormat.includes('application/xml')) {
    res.setHeader('Content-Type', 'application/xml');
    res.send(UserService.toXML(user));
  } else {
    res.json({
      ok: true,
      data: user,
      meta: {
        version: apiVersion,
        timestamp: new Date().toISOString(),
      },
    });
  }
}
```

### Example 6: Complex Business Logic

```typescript
/**
 * Complex order processing
 * Route: POST /api/orders
 * Body: Order data
 * Query: ?validate=true&dryRun=false
 */
async function createOrder(req: IRequest, res: IResponse): Promise<void> {
  const data = req.data();

  // Extract order data
  const orderData = data as {
    customerId: string;
    items: Array<{
      productId: string;
      quantity: number;
      price: number;
    }>;
    shipping: {
      address: string;
      method: string;
    };
    payment?: {
      method: string;
      token: string;
    };
  };

  // Get processing options
  const validateOnly = req.get<boolean>('validate', false);
  const dryRun = req.get<boolean>('dryRun', false);
  const priority = req.get<string>('priority', 'normal');

  try {
    // Validate order
    const validation = await OrderService.validate(orderData);
    if (!validation.isValid) {
      return res.setStatus(400).json({
        ok: false,
        errors: validation.errors,
      });
    }

    if (validateOnly) {
      return res.json({
        ok: true,
        valid: true,
        estimatedTotal: validation.estimatedTotal,
      });
    }

    // Process order
    const order = await OrderService.create({
      ...orderData,
      priority,
      dryRun,
    });

    // Apply promotions if any
    const discounts = await PromotionService.apply(orderData.customerId, order);

    res.status(dryRun ? 200 : 201).json({
      ok: true,
      order: {
        id: order.id,
        total: order.total,
        discounts: discounts.length > 0 ? discounts : undefined,
        status: dryRun ? 'draft' : 'pending',
        estimatedDelivery: order.estimatedDelivery,
      },
    });
  } catch (error) {
    Logger.error('Order creation failed', { error, orderData });
    res.setStatus(500).json({
      ok: false,
      error: 'Order processing failed',
      code: 'ORDER_PROCESSING_ERROR',
    });
  }
}
```

## Best Practices

### 1. Always Use Bracket Notation for Dynamic Data

```typescript
// ✅ Correct
const name = data['name'] as string;
const enabled = data['enabled'] as boolean;

// ❌ TypeScript error
const name = data.name; // Property 'name' comes from an index signature
```

### 2. Provide Default Values

```typescript
// ✅ Good
const limit = Math.min(100, Math.max(1, req.get<number>('limit', 10)));
const status = req.get<string>('status', 'active');

// ❌ Risky
const limit = req.get<number>('limit'); // Could be undefined
```

### 3. Validate Required Fields

```typescript
// ✅ Validate early
const name = data['name'] as string;
if (!name) {
  return res.setStatus(400).json({ error: 'Name is required' });
}

// ❌ Access without validation
const name = data['name'] as string; // Could be undefined
```

### 4. Use Type Assertions Wisely

```typescript
// ✅ Specific typing
const enabled = data['enabled'] as boolean;

// ✅ Interface typing
interface WorkerConfig {
  name: string;
  enabled: boolean;
}
const config = req.data() as WorkerConfig;

// ❌ Overly broad typing
const data = req.data() as any; // Avoid 'any'
```

### 5. Handle Boolean Conversion

```typescript
// ✅ Robust boolean conversion
const rawEnabled = data['enabled'];
let enabled: boolean;
if (typeof rawEnabled === 'boolean') {
  enabled = rawEnabled;
} else {
  const enabledStr = String(rawEnabled).toLowerCase();
  enabled = ['true', '1', 'yes', 'on'].includes(enabledStr);
}

// ❌ Unsafe conversion
const enabled = Boolean(data['enabled']); // 0 becomes false, "false" becomes true
```
