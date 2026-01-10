# OpenAPI

ZinTrust can generate an **OpenAPI 3.0.3** document at runtime from the in-memory route registry. This keeps your API documentation close to your actual routes (and avoids a separate, manually maintained spec file).

This page covers:

- What endpoints are exposed
- How route registrations become an OpenAPI document
- What metadata fields affect the spec
- How to keep the spec stable and low-noise over time

## Endpoints

The default documentation routes are registered in `routes/openapi.ts`:

- `GET /openapi.json` – machine-readable OpenAPI JSON
- `GET /docs` – Swagger UI HTML page that renders `/openapi.json`

The generated spec uses:

- `Env.APP_NAME` for the title
- `Env.get('APP_VERSION', '0.0.0')` for the version
- `Env.BASE_URL` or `http://{HOST}:{PORT}` for the server URL (when available)

## Configuration (Environment)

### `BASE_URL`

If `BASE_URL` is set (non-empty), it becomes the OpenAPI `servers[0].url`.

Example:

```env
BASE_URL=https://api.example.com
```

### `HOST` + `PORT`

If `BASE_URL` is empty, ZinTrust will try to construct `http://{HOST}:{PORT}`.

Example:

```env
HOST=localhost
PORT=3000
```

### `APP_NAME` + `APP_VERSION`

These feed `info.title` and `info.version`.

```env
APP_NAME=ZinTrust
APP_VERSION=1.2.3
```

## How generation works (high level)

1. Routes are registered through `Router.get/post/put/patch/del/...`.
2. The router calls `normalizeRouteMeta(options?.meta)` and pushes a `RouteRegistration` into the in-memory `RouteRegistry`.
3. `OpenApiGenerator.generate(RouteRegistry.list(), options)` converts the registry into an OpenAPI document.
4. `/docs` renders Swagger UI pointing at `/openapi.json`.

## Route Registry → OpenAPI

ZinTrust’s `RouteRegistry` stores minimal information needed for docs:

```ts
export type RouteRegistration = {
  method: string;
  path: string;
  middleware?: readonly string[];
  meta?: RouteMeta;
};
```

When generating the spec:

- Paths like `/users/:id` are normalized to `/users/{id}`
- Every operation gets a deterministic `operationId` based on method+path
- Request schemas (body/query/headers/params) become OpenAPI `parameters` / `requestBody`
- Response schema/status become OpenAPI `responses`

## OpenAPI generator options

The generator accepts:

```ts
export type OpenApiGeneratorOptions = {
  title: string;
  version: string;
  description?: string;
  serverUrl?: string;
  excludePaths?: readonly string[];
};
```

In the default OpenAPI route, ZinTrust excludes the docs endpoints themselves:

```ts
excludePaths: ['/openapi.json', '/docs'];
```

## Metadata that affects the spec

OpenAPI output is driven by **route metadata**. The normalized shape is:

```ts
export type RouteMeta = {
  summary?: string;
  description?: string;
  tags?: readonly string[];

  request?: {
    bodySchema?: ValidationSchema;
    querySchema?: ValidationSchema;
    paramsSchema?: ValidationSchema;
    headersSchema?: ValidationSchema;
  };

  response?: {
    status?: number;
    schema?: unknown;
  };
};
```

### Summary, description, tags

- `meta.summary` → OpenAPI `summary`
- `meta.description` → OpenAPI `description`
- `meta.tags` → OpenAPI `tags` array

Tips:

- Use **stable tags** (e.g. `['Users']`, `['Billing']`, `['Admin']`) so Swagger UI groups consistently.
- Prefer short summaries; put details in the description.

### Path parameters (`:id`)

If your route path includes `:id`, the generator will:

- Emit OpenAPI path `/users/{id}`
- Create a required `path` parameter for `id`

To type/validate path params, provide `meta.request.paramsSchema`.

```ts
import { Schema } from '@zintrust/core';

Router.get(router, '/users/:id', handler, {
  meta: {
    summary: 'Get a user',
    tags: ['Users'],
    request: {
      paramsSchema: Schema.create().required('id').integer('id').positiveNumber('id'),
    },
    response: {
      status: 200,
      schema: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          email: { type: 'string', format: 'email' },
        },
        required: ['id', 'email'],
      },
    },
  },
});
```

If you omit `paramsSchema`, the parameter still exists in the spec, but defaults to `{ type: 'string' }`.

### Query / header parameters

`meta.request.querySchema` and `meta.request.headersSchema` become OpenAPI parameters.

```ts
Router.get(router, '/users', handler, {
  meta: {
    summary: 'List users',
    tags: ['Users'],
    request: {
      querySchema: Schema.create().integer('page').integer('limit').max('limit', 100),
      headersSchema: Schema.create().string('x-client-version'),
    },
  },
});
```

### JSON request body

If `meta.request.bodySchema` exists, the generator emits `requestBody` with `application/json`.

```ts
Router.post(router, '/users', handler, {
  meta: {
    summary: 'Create user',
    tags: ['Users'],
    request: {
      bodySchema: Schema.create()
        .required('email')
        .email('email')
        .required('password')
        .minLength('password', 8),
    },
    response: {
      status: 201,
      schema: {
        type: 'object',
        properties: { id: { type: 'integer' } },
        required: ['id'],
      },
    },
  },
});
```

### Responses

If you don’t specify `meta.response`, the generator emits a default `200: { description: 'OK' }`.

If you specify `meta.response.status`:

- `204` → response description becomes `No Content`
- otherwise → response description is `OK`

If you specify `meta.response.schema`, it becomes `responses[status].content['application/json'].schema`.

## Operation IDs (stability)

Every operation gets an `operationId` derived from method+path (after converting `:id` to `{id}`), for example:

- `GET /users/{id}` → `get_users__id_`

These IDs are stable as long as your method/path are stable.

If you are using client generation tools, treat method/path changes as breaking.

## Security and deployment notes

- `/openapi.json` and `/docs` are public by default. If your API is private, protect these endpoints with middleware or only enable them in non-production environments.
- The spec should not contain secrets. Don’t embed tokens in descriptions.
- If you generate clients, ensure the `serverUrl` matches the environment where the client will run.

## Troubleshooting

### “My route is missing from the spec”

Checklist:

1. Ensure the route is registered via `Router.*` (so it records into `RouteRegistry`).
2. Ensure the path is not in `excludePaths`.
3. Ensure the code path that registers routes runs before `/openapi.json` is requested.

### “Path params show as string”

Provide `meta.request.paramsSchema`. Without it, OpenAPI falls back to `string` for path parameters.

### “No request body appears”

Provide `meta.request.bodySchema`. Only JSON request bodies are emitted today.

## See also

- [docs/route-metadata.md](docs/route-metadata.md)
- [docs/schema-to-openapi-mapping.md](docs/schema-to-openapi-mapping.md)
- [docs/swagger-ui.md](docs/swagger-ui.md)
