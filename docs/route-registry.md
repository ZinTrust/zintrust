# Route Registry

ZinTrust records route registrations into an in-memory registry at startup.

This is primarily used for:

- OpenAPI generation (runtime `/openapi.json`)
- diagnostics and introspection tooling (e.g. “list routes” features)

Implementation: `src/routing/RouteRegistry.ts`.

## What gets recorded

Each recorded route is a `RouteRegistration`:

- `method` (string)
- `path` (as registered, e.g. `/users/:id`)
- `middleware` (names, not functions)
- `meta` (normalized route metadata)

That metadata is the same structure used by OpenAPI generation:

- `meta.summary`, `meta.description`, `meta.tags`
- `meta.request.*Schema` for body/query/params/headers
- `meta.response.status` and `meta.response.schema`

## Meta normalization

Routes can provide metadata in a shorthand format or in the fully normalized format.

`normalizeRouteMeta()` converts the shorthand into:

- `request.bodySchema`
- `response.status` and `response.schema`

This helps keep route registrations ergonomic while still giving tools a consistent shape.

## How it’s populated

Every route registration helper records into the registry.

Examples include:

- `Router.get(...)`
- `Router.post(...)`
- `Router.put(...)`
- `Router.patch(...)`
- `Router.del(...)`
- `Router.any(...)`
- `Router.resource(...)`

The registry is process-local and is built as your app registers routes.

## Reading and clearing the registry

- `RouteRegistry.list()` returns a shallow copy of the recorded registrations.
- `RouteRegistry.clear()` empties the registry.

`clear()` is mainly useful in tests where you create multiple apps/routers in one process.

## Relationship to OpenAPI

OpenAPI generation consumes `RouteRegistry.list()`.

That means:

- if a route isn’t registered, it won’t appear in `/openapi.json`
- if you conditionally register routes (feature flags, env), the spec will reflect that

For details on schema conversion and path normalization, see `docs/openapi.md` and `docs/schema-to-openapi-mapping.md`.
