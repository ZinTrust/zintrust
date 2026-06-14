# ZinTrust Core: Cloudflare adapter should send a null body for null-body statuses

## Summary

The Cloudflare runtime adapter constructs the outbound `Response` from the
framework response object. When a handler produces a status that the Fetch
standard defines as a "null body status" (`101`, `204`, `205`, `304`) but the
framework response body is an empty string `""` (which is the common shape a
CORS preflight / "no content" response produces), the adapter passes that empty
string into `new Response(body, ...)`.

The Workers runtime then logs, on every such response:

> Constructing a Response with a null body status (204) and a non-null,
> zero-length body. This is technically incorrect, and we recommend you update
> your code to explicitly pass in a `null` body, e.g.
> `new Response(null, { status: 204, ... })`.

It is a warning today, but the runtime explicitly notes the zero-length-body
behavior "may change in the future", so relying on it is unsafe.

## Why it happens

`formatCloudflareResponse()` only treats `null` / `undefined` bodies as
"no body". An empty string is neither, so it is forwarded verbatim. The empty
string is what a 204 / preflight path naturally yields.

## Preferred upstream fix

Before constructing the `Response`, force the body to `null` whenever the
status code is a Fetch null-body status. This keeps the adapter spec-compliant
regardless of what body value the upstream handler left in place:

```js
const NULL_BODY_STATUS_CODES = new Set([101, 204, 205, 304]);
let body = null;
if (!NULL_BODY_STATUS_CODES.has(response.statusCode) &&
    response.body !== null &&
    response.body !== undefined) {
  // ...existing string / ReadableStream / toString() handling...
}
return new Response(body, { status: response.statusCode, headers });
```

This is a pure correctness fix with no behavioral change for any status that is
allowed to carry a body.

## Scope note

The same guard is worth applying in any other runtime adapter that builds a
platform `Response`/equivalent from the shared framework response shape, so the
behavior is consistent across runtimes.
