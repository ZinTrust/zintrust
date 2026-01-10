# Log Correlation

Log correlation is the practice of ensuring every log line can be tied to:

- a single HTTP request
- a distributed trace (when tracing is enabled)
- a user/tenant (when appropriate)

In ZinTrust, correlation is built around **`RequestContext`** and the HTTP **`LoggingMiddleware`**.

## Correlation fields

### `requestId`

`requestId` is the primary per-request identifier.

Where it comes from:

- If the client sends `x-request-id`, ZinTrust uses it.
- Otherwise ZinTrust generates a UUID.

Where it is stored:

- `RequestContext` (the canonical runtime object)
- `req.context['requestId']` (mirrored for easy access)

### `traceId`

`traceId` is the distributed trace identifier.

Where it comes from:

- If the client sends W3C `traceparent`, ZinTrust extracts the 32-hex trace id.
- Otherwise, if the client sends `x-trace-id`, ZinTrust uses it.
- Otherwise, if microservices tracing has populated `req.context.trace.traceId`, ZinTrust uses it.
- Otherwise, if `req.context['traceId']` is already set (by middleware or an upstream adapter), ZinTrust uses it.

Where it is stored:

- `RequestContext.traceId`
- `req.context['traceId']`

## What LoggingMiddleware logs

The middleware in `src/middleware/LoggingMiddleware.ts` prefixes request logs with:

- `[requestId]` when only `requestId` is known
- `[requestId trace=<traceId>]` when a `traceId` is available

It logs a start and a completion line:

- `↓ METHOD /path`
- `↑ METHOD /path STATUS DURATIONms`

This pattern makes it easy to find _all_ logs for a specific request, and then jump to its trace.

## Recommended header propagation

### Incoming requests

- Preserve `x-request-id` from your edge/load balancer (or set one if missing).
- Preserve `traceparent` (and optionally `tracestate`) from OpenTelemetry-enabled clients/edges.

### Outgoing requests

If you use ZinTrust’s OpenTelemetry integration, outgoing HTTP calls can propagate trace context.
See [docs/opentelemetry.md](docs/opentelemetry.md).

## Suggested logging shape

Correlation is strongest when your logs are structured and always include the same keys.

Recommended fields (at minimum):

- `requestId`
- `traceId` (optional)
- `method`
- `path` (prefer route templates if available)
- `status`
- `durationMs`
- `tenantId` (optional; consider privacy)
- `userId` (optional; consider privacy)

ZinTrust’s `Logger` supports redaction and structured formats; prefer that over ad-hoc `console.log`.

## Common pitfalls

- **Regenerating IDs mid-request:** ensure your own middleware does not overwrite `req.context['requestId']` or `traceId`.
- **Cardinality explosion:** do not put raw user identifiers into metric labels; prefer logs/traces for high-cardinality identifiers.
- **Proxy stripping headers:** some proxies drop unknown headers; explicitly allow-list `x-request-id` and `traceparent`.
- **Leaking secrets:** never log tokens, cookies, passwords, or raw Authorization headers.

## Quick debugging workflow

1. From an error log line, copy the `requestId` (and `traceId` if present).
2. Search your log store for `requestId=<id>`.
3. If `traceId` exists, jump to your tracing backend and open the trace.
4. Use `/metrics` to check latency/error spikes, then pivot back to sampled logs.
