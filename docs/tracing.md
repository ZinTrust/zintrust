# Tracing

ZinTrust supports tracing in two complementary ways:

1. **Standards-based distributed tracing via OpenTelemetry** (W3C `traceparent`)
2. **Lightweight microservice-to-microservice request tracing middleware** (custom `x-trace-*` headers)

This page explains when to use each, and how they relate to log correlation.

## 1) OpenTelemetry (recommended)

ZinTrust has an **optional OpenTelemetry integration** implemented in `src/observability/OpenTelemetry.ts`.

Design choices:

- Depends only on `@opentelemetry/api` (no SDK/exporter bundled).
- Best-effort: tracing must never break request handling.
- Uses W3C context propagation (`traceparent` / `tracestate`).

### Enabling OpenTelemetry

1. Configure an SDK + exporter in your application entrypoint.
2. Enable ZinTrust tracing:

```bash
export OTEL_ENABLED=true
```

The full setup and examples live in [docs/opentelemetry.md](docs/opentelemetry.md).

### What ZinTrust records

When enabled:

- Creates an incoming HTTP server span per request.
- Extracts parent context from incoming headers.
- Updates span name to `METHOD /route/template` once a route is matched.
- Records common attributes like:
  - `http.method`, `http.target`, `http.route`, `http.status_code`
  - `service.name`
  - `zintrust.request_id`
  - `zintrust.tenant_id` and `enduser.id` when available

It also records DB query spans **only when a request span is active**, to avoid orphan spans.

### Relationship to RequestContext

RequestContext is still the source of truth for request-scoped identifiers:

- `requestId` comes from `x-request-id` (or is generated).
- `traceId` can be extracted from `traceparent` (W3C) or `x-trace-id` and stored in `RequestContext.traceId`.

This is what enables log ↔ trace correlation.

## 2) Microservices RequestTracingMiddleware (lightweight)

Separately from OpenTelemetry, ZinTrust includes a microservices-oriented tracing middleware:

- Implementation: `src/microservices/RequestTracingMiddleware.ts`
- Purpose: lightweight correlation across service-to-service calls when you don’t want full OpenTelemetry.

It uses custom headers:

- `x-trace-id`
- `x-parent-service-id`
- `x-trace-depth`

Behavior:

- If enabled, it creates or reuses a `x-trace-id` and attaches it to:
  - `req.context.trace` (an object with trace metadata)
  - `req.context.traceLogger` (a helper that prefixes logs with the trace id)
- It also syncs `RequestContext.traceId` so shared logging/observability can rely on the canonical context.
- It also sets trace headers on the response.
- It supports sampling via a `samplingRate` parameter.

This mechanism is primarily for **microservice debugging** and is distinct from W3C `traceparent`.

## How to choose

- Prefer **OpenTelemetry** if:
  - you already have an OTel backend (Jaeger, Tempo, Honeycomb, New Relic, Datadog)
  - you want standards-based context propagation and rich spans

- Consider **RequestTracingMiddleware** if:
  - you want a lightweight, log-centric correlation mechanism
  - you control both sides of service-to-service calls and can propagate custom headers

You can also use both, but be explicit about which ID is your “primary” trace identifier.

## Troubleshooting

- If you see request logs without a trace id, confirm the client/edge is sending `traceparent` and `OTEL_ENABLED=true` is set.
- If OpenTelemetry is enabled but traces do not appear, confirm your app has an SDK/exporter installed (ZinTrust does not ship one).
- If microservice trace headers are missing, confirm the middleware is installed for that service and that sampling isn’t filtering the request.
