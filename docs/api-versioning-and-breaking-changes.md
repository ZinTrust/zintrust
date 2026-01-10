# API Versioning & Breaking Changes

Zintrust encourages explicit versioning at the route level.

## Recommended approach

Use URL-based versioning with route groups:

```ts
Router.group(router, '/api/v1', (r) => {
  Router.get(r, '/users', handler);
});
```

When you introduce a breaking change, add a new version group (`/api/v2`) and keep older versions stable until deprecation.

## Deprecation guidance

- Prefer additive changes in-place (new fields, new optional params).
- For breaking changes, cut a new version.
- Communicate EOL dates and update docs.

## OpenAPI

Expose versioned endpoints in `/openapi.json` (or generate per-version docs by excluding paths).
