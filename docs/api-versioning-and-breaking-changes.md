# API Versioning & Breaking Changes

ZinTrust encourages explicit API versioning at the route level so:

- breaking changes are deliberate and reviewable
- old clients keep working until you deprecate them
- OpenAPI documentation remains truthful

## Recommended approach: URL-based versioning

The simplest pattern is URL-based versioning using `Router.group()`.

Example:

```ts
import { Router, type IRouter } from '@zintrust/core';

export function registerRoutes(router: IRouter): void {
  Router.group(router, '/api/v1', (r) => {
    Router.get(r, '/users', handler);
  });
}
```

When you introduce a breaking change, add a new version group:

- `/api/v2/...`

And keep the old version stable until its deprecation window ends.

## What counts as a “breaking change”

Common breaking changes:

- removing or renaming response fields
- changing field types (string → number)
- changing meaning/semantics of a field
- changing auth requirements
- changing error status codes/shape in a non-backwards-compatible way

Non-breaking (usually safe in-place):

- adding new optional fields
- adding new endpoints
- adding new optional query parameters

## Deprecation policy (practical)

Recommended policy that works well in teams:

- announce deprecation when you introduce `/api/v2`
- keep `/api/v1` supported for a fixed window (e.g. 60–180 days)
- publish an EOL date and stick to it

If you want machine-readable deprecation signals, consider adding:

- a response header like `Deprecation: true` for deprecated endpoints
- docs notes + changelog entries

## OpenAPI implications

ZinTrust OpenAPI generation is route-registry driven.

That means:

- if you register both `/api/v1` and `/api/v2` routes, they will both show up in `/openapi.json`.
- versioning via path prefixes naturally keeps each version’s endpoints distinct.

If you need per-version OpenAPI documents, the typical approach is:

- run separate routers per version (or separate apps) and expose multiple specs, or
- post-process/filter the generated spec by path prefix.

## Operational tips

- Keep versioned route modules split by file for clarity (e.g. `routes/api.v1.ts`, `routes/api.v2.ts`).
- Avoid “silent” breaking changes inside middleware.
- Use `zin qa` as a release gate when you bump major versions.
