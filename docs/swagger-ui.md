# Swagger UI

ZinTrust serves a Swagger UI page that renders the **runtime-generated** OpenAPI spec.

This is implemented in `routes/openapi.ts`.

## Endpoints

- `GET /openapi.json` — returns the generated OpenAPI 3.0.3 document
- `GET /docs` — serves an HTML page embedding Swagger UI

`/docs` is just a thin HTML wrapper around the spec at `/openapi.json`.

## How /docs works

`/docs` returns HTML that:

- loads Swagger UI assets from the `swagger-ui-dist` CDN (currently `https://unpkg.com/swagger-ui-dist@5/...`)
- initializes Swagger UI with:

```js
SwaggerUIBundle({
  url: '/openapi.json',
  dom_id: '#swagger-ui',
  presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
  layout: 'BaseLayout',
});
```

Because it uses `url: "/openapi.json"`, the UI always reflects the **currently registered routes** in memory.

## Customizing the server URL in the spec

The OpenAPI route computes `servers[0].url` as follows:

- If `Env.BASE_URL` is set (non-empty), it is used.
- Otherwise it uses `http://{Env.HOST}:{Env.PORT}` when both are valid.
- Otherwise `servers` is omitted.

If your Swagger UI shows “Try it out” requests targeting the wrong host/port, set `BASE_URL`.

## Security considerations

Swagger UI is often safe in dev/staging, but in production you should decide intentionally:

- Exposing `/docs` may leak endpoint details.
- Exposing `/openapi.json` may leak schema shapes and tags.

Common patterns:

- Disable public access at the edge (VPN / IP allowlist / internal network).
- Add auth middleware to `/docs` and `/openapi.json` (or serve them only in non-production).

## Environments without CDN access

Some environments (locked-down enterprise networks) block external CDNs.

Options:

- **Self-host Swagger UI assets** in your app and update the HTML template to point to local JS/CSS.
- **Serve OpenAPI only** (`/openapi.json`) and render it in an external docs portal.

## Troubleshooting

- Blank page: check browser console/network for blocked CDN scripts.
- “Failed to fetch” when trying endpoints: confirm CORS and that your `BASE_URL` is correct.
- Missing endpoints in UI: ensure routes are actually registered at runtime (RouteRegistry is populated when routes are registered).
