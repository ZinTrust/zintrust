# Request Typing & Validation

Zintrust validation is **schema-based**, with a fluent API similar to the ORM’s QueryBuilder style.

The goal is to let you:

- validate request inputs consistently
- keep runtime validation close to your route handlers
- get **typed** access to validated values in handlers

Primary implementations:

- `Schema` + `Validator`: `src/validation/Validator.ts`
- `ValidationMiddleware`: `src/middleware/ValidationMiddleware.ts`
- Request types (`IRequest`, `ValidatedRequest`): `src/http/Request.ts`

## Mental model

There are two complementary pieces:

1. **Enforcement** (runtime): middleware validates inputs and populates `req.validated`.
2. **Documentation** (OpenAPI): route metadata can reference schemas so the OpenAPI generator can describe your contract.

They are related, but separate:

- Route metadata does **not** enforce anything.
- Middleware does **not** automatically appear in OpenAPI unless you also provide metadata.

## Schema building blocks

Create a schema with `Schema.create()` (untyped) or `Schema.typed<T>()` (typed):

```ts
import { Schema } from '@validation/Validator';

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

## Enforcement with ValidationMiddleware

Zintrust provides helpers to validate different request parts:

- `ValidationMiddleware.createBody(schema)` — validates JSON body
- `ValidationMiddleware.createQuery(schema)` — validates parsed query object
- `ValidationMiddleware.createParams(schema)` — validates route params

On success, middleware stores the validated objects under `req.validated`.

### Body validation behavior

`createBody` validates `req.body` for most methods, but deliberately **skips** validation for `GET` and `DELETE`.

On success:

- `req.validated.body` is set
- `next()` is called

On failure:

- response is sent immediately
- handlers after the middleware will not run

### Error responses

Validation errors are serialized by `ValidationMiddleware`:

- If the thrown error has `toObject()`, it responds `422` with `{ errors: <toObject()> }`.
- Otherwise it responds `400` with `{ error: "Invalid request body" }`.

This means:

- your handler can treat “I have `req.validated.body`” as a strong precondition
- clients should expect `422` for schema failures

## Typed validated access in handlers

The request type includes a `ValidatedRequest<TBody, TQuery, TParams, THeaders>` helper type.

If your route ensures the validations ran, you can type your handler accordingly.

Example pattern:

```ts
import type { ValidatedRequest } from '@http/Request';
import type { IResponse } from '@http/Response';

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

## Recommended wiring pattern (this repo)

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

## Route metadata vs middleware (OpenAPI)

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

## Advanced notes

- `Validator.validate(data, schema)` throws a structured validation error (see `src/validation/ValidationError.ts`).
- `Validator.isValid(data, schema)` returns boolean and logs errors (useful in some internal flows, less ideal for HTTP).
- Query parsing yields `Record<string, string | string[]>`; validate and then read `req.validated.query` for normalized access.
