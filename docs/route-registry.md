# Route Registry

Zintrust records route registrations to an in-memory registry at startup. This is primarily used for documentation and tooling (like OpenAPI generation).

## What it records

Each route registration captures:

- `method`
- `path`
- `middleware` (names)
- `meta` (normalized route metadata)

See `src/routing/RouteRegistry.ts`.

## How it’s populated

Every call to `Router.get/post/put/patch/del/any/resource()` records the route into the registry (see `src/routing/Router.ts`).

## Typical usage

- Generate OpenAPI JSON at runtime from `RouteRegistry.list()`.
- Export route lists for diagnostics.

## Notes

- The registry is process-local and resets when the server restarts.
- If you register routes conditionally, the registry will reflect that.
