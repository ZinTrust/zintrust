# Request Context

`RequestContext` is ZinTrust’s request-scoped context object, designed for **correlation** and other cross-cutting concerns.

It does two things at once:

1. Stores a durable context object on the request (`req.context.requestContext`).
2. Mirrors the same context into an async-safe store (via Node `AsyncLocalStorage` when available).

This enables:

- Consistent request IDs in logs and error responses
- Trace correlation via W3C `traceparent`
- Late-binding identity (user/tenant) by auth middleware
- Metrics/tracing enrichment in the kernel without plumbing values through every call

Implementation: `src/http/RequestContext.ts`.

## What’s in the context

The core shape is:

```ts
export interface IRequestContext {
  requestId: string;
  traceId?: string;
  userId?: string;
  tenantId?: string;

  startTime: number;
  method: string;
  path: string;
  userAgent?: string;

  // Populated at the end of the request
  status?: number;
  duration?: number;
}
```

### Field sources

- `requestId`
  - From `x-request-id` header when present and string
  - Otherwise generated via `generateUuid()`
- `traceId`
  - Extracted from `traceparent` (W3C Trace Context) when valid
  - Otherwise can be supplied via `req.context.traceId`
- `userId`, `tenantId`
  - Typically populated by auth middleware (JWT/API key/session)
- `method`, `path`, `userAgent`
  - Read from the request at creation time

## How the kernel uses RequestContext

The HTTP kernel creates and installs a context for every request:

1. `RequestContext.create(req)` creates a context object and attaches it to `req.context`.
2. `RequestContext.run(context, async () => { ... })` establishes the async-local store so deeper code can read the current context.
3. When the request completes, the kernel enriches the context with status and duration, then emits metrics/tracing.

This pattern is important:

- Identity (`userId`, `tenantId`) may not be known at the start.
- The kernel can still attach identity to spans/metrics at the end, after middleware runs.

## AsyncLocalStorage vs fallback mode

ZinTrust attempts to use Node’s `AsyncLocalStorage` through `@node-singletons/async_hooks`.

If it cannot import that module (for example in non-Node runtimes), it uses a small in-memory fallback store that behaves like a stack:

- `run(ctx, fn)` sets `store = ctx`, executes `fn`, then restores the previous store.
- This preserves correctness for synchronous flows.
- It does not provide true async context propagation in runtimes without AsyncLocalStorage.

If you rely on async context propagation, prefer Node runtimes.

## Common usage patterns

### Access the current context

If you’re in a request flow and need the current context:

```ts
import { RequestContext } from '@zintrust/core';

const ctx = await RequestContext.current();
if (ctx) {
  Logger.info('Doing work', { requestId: ctx.requestId, traceId: ctx.traceId });
}
```

Notes:

- `current()` is async because the underlying storage is resolved lazily.
- `current()` can return `undefined` if you call it outside a request context.

### Prefer passing `req` for updates

If you have access to the request, use it.

```ts
const ctx = RequestContext.get(req);
if (ctx) {
  Logger.info('Start', { requestId: ctx.requestId });
}
```

### Set identity (userId / tenantId)

Auth middleware should update identity using helper setters so:

- `req.context.userId` / `req.context.tenantId` are set
- The active request context object (if present) is updated too

```ts
RequestContext.setUserId(req, userId);
RequestContext.setTenantId(req, tenantId);
```

Similarly for trace IDs:

```ts
RequestContext.setTraceId(req, traceId);
```

### Traceparent parsing

`RequestContext.create(req)` understands the W3C `traceparent` header:

Format: `version-traceid-spanid-flags`

Example:

```
00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01
```

ZinTrust extracts the 32-hex `traceid` if valid and non-zero.

## Interaction with logging, metrics, tracing

### Logging

Logging middleware and application logs can include `requestId` and `traceId` to correlate events.

Recommendation:

- Always include `requestId`
- Include `traceId` when present
- Avoid logging tokens or secrets

### Metrics

The kernel records request metrics using the context’s timing fields (start time and duration), and labels by a **route template** when available.

### Tracing

If OpenTelemetry is enabled (`OTEL_ENABLED=true`), the kernel creates a server span and later enriches it with:

- `enduser.id` from `context.userId`
- `zintrust.tenant_id` from `context.tenantId`
- `zintrust.trace_id` from `context.traceId`

The “late binding” is intentional: auth middleware runs after the request starts.

## Testing

### Unit testing code that reads RequestContext

If your code uses `RequestContext.current()`, wrap the call with `RequestContext.run(...)` in tests:

```ts
import { RequestContext } from '@zintrust/core';

const ctx = {
  requestId: 'test-req-1',
  startTime: Date.now(),
  method: 'GET',
  path: '/test',
} as const;

await RequestContext.run(ctx, async () => {
  const current = await RequestContext.current();
  expect(current?.requestId).toBe('test-req-1');
});
```

### Integration tests

If you’re testing HTTP routes end-to-end, prefer the project’s HTTP test helpers so the kernel sets everything up naturally.

## Best practices

- Treat RequestContext as a **cross-cutting concern store** (correlation, identity, tenancy), not a general-purpose data bucket.
- Keep `tenantId` low-sensitivity and stable; avoid putting PII into trace/metrics attributes.
- Use the helper setters when writing identity fields.
- Prefer `routePath` (template) rather than raw `path` when generating labels.

## Troubleshooting

### `RequestContext.current()` returns `undefined`

Common causes:

- Calling it outside a request lifecycle
- Calling it in a background job without wrapping the job in `RequestContext.run(...)`

Fix:

- Pass the context explicitly to background jobs, then re-establish it in the worker.

### Trace ID isn’t extracted

Checklist:

- Ensure `traceparent` is being forwarded by your ingress/proxy
- Ensure the header matches W3C format and has a valid, non-zero trace ID

## See also

- [docs/log-correlation.md](docs/log-correlation.md)
- [docs/tracing.md](docs/tracing.md)
- [docs/multi-tenancy.md](docs/multi-tenancy.md)
