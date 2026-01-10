# OpenTelemetry (Tracing)

ZinTrust supports **optional OpenTelemetry tracing** to enable distributed request traces across services.

Important design choice: the ZinTrust core only depends on `@opentelemetry/api` and does **not** ship an SDK or exporter. Your application owns the exporter configuration.

## Enable tracing

1. Configure an OpenTelemetry SDK + exporter **in your app entrypoint** (before starting the server).

Example (OTLP over HTTP):

```bash
npm i @opentelemetry/sdk-node @opentelemetry/auto-instrumentations-node \
  @opentelemetry/exporter-trace-otlp-http
```

```ts
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';

const sdk = new NodeSDK({
  traceExporter: new OTLPTraceExporter({
    url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
  }),
  instrumentations: [getNodeAutoInstrumentations()],
});

await sdk.start();
```

2. Enable ZinTrust tracing:

```bash
export OTEL_ENABLED=true
```

## What ZinTrust records

When enabled, ZinTrust creates spans in the request pipeline and propagates trace context.

### Incoming HTTP spans

- A `SpanKind.SERVER` span is created per request.
- The span name is updated to `METHOD /route/template` when a route is matched.
- The span records (best-effort) attributes such as:
  - `http.method`, `http.target`, `http.route`, `http.status_code`
  - `service.name` (from `Env.APP_NAME`)
  - `zintrust.request_id`
  - `enduser.id` and `zintrust.tenant_id` (when available on `req.context`)

Implementation lives in:

- `OpenTelemetry.startHttpServerSpan(...)` and friends: `src/observability/OpenTelemetry.ts`
- Request lifecycle wiring: `src/http/Kernel.ts`

### Outgoing HTTP propagation

ZinTrust injects W3C trace headers (`traceparent`, `tracestate`) into outgoing requests made via `HttpClient`.

Implementation:

- `src/tools/http/Http.ts`

### Database spans

ZinTrust records a short-lived `db.query` span for each DB query **when a request span is active** (to avoid creating orphan DB traces).

Implementation:

- Hook: `src/orm/Database.ts` (`after-query` event)
- Span helper: `OpenTelemetry.recordDbQuerySpan(...)` in `src/observability/OpenTelemetry.ts`

## Notes

- Tracing is intentionally **best-effort**: failures in tracing must never break request handling.
- If `OTEL_ENABLED` is not set, ZinTrust does not create spans or inject headers.
