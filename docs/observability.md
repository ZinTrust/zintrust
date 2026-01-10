# Observability

Zintrust ships **best-effort** observability primitives that you can adopt incrementally:

- Request-scoped correlation via `RequestContext`
- Structured logging (with redaction)
- Health endpoints
- Prometheus metrics (`/metrics`)
- Optional OpenTelemetry tracing

The core idea is: observability should help you in production without becoming a production dependency.

## Design principles

### Observability must not break requests

Zintrust treats metrics/tracing as “nice to have”. If a metrics client or tracing export is misconfigured, requests should still succeed.

### Correlate using IDs

Zintrust maintains a request-scoped context that includes:

- `requestId` (from `x-request-id` or generated)
- `traceId` (from W3C `traceparent` when present)
- optional `userId` and `tenantId` (set by auth middleware)

This enables consistent correlation across logs and traces.

See: [request-context](request-context).

### Metrics should be low-cardinality

Metrics are for aggregates and dashboards.

- Use stable **route templates** (e.g. `/api/users/:id`) as the `route` label
- Avoid raw paths (`/api/users/123`) and query strings as labels

If you need per-request details, use logs/tracing instead.

## Logs

Logging is the baseline observability layer.

Recommended patterns:

- Emit a request completion log (method, route, status, duration)
- Include `requestId` always
- Include `traceId` when present
- Consider including `tenantId` if it’s non-sensitive and useful

Avoid:

- Secrets, tokens, passwords
- High-volume logs in tight loops

See: [log-correlation](log-correlation).

## Health checks

Health endpoints allow orchestration systems to understand process state.

Typical usage:

- Liveness: “is the process up?”
- Readiness: “can it serve traffic?” (e.g. DB reachable)

See: [health-checks](health-checks).

## Metrics (Prometheus)

Zintrust exposes Prometheus-compatible metrics when enabled.

Highlights:

- Enable with `METRICS_ENABLED=true`
- Optional path override via `METRICS_PATH` (default `/metrics`)
- HTTP counters/histograms and DB counters/histograms

See: [metrics](metrics).

## Tracing (OpenTelemetry)

Tracing is optional and guarded by configuration (e.g. `OTEL_ENABLED=true`).

Zintrust’s approach is intentionally conservative:

- Uses OpenTelemetry API patterns
- Avoids hard coupling to an SDK/exporter
- Creates request spans and (when applicable) DB spans
- Enriches spans with `requestId`, `tenantId`, and `userId` when available

See: [tracing](tracing).

## Putting it together

Recommended progression:

1. Turn on structured logs + request correlation (`x-request-id`)
2. Add health endpoints for orchestration
3. Enable Prometheus metrics + dashboards/alerts
4. Add OpenTelemetry tracing when you need per-request performance diagnostics

## Troubleshooting

### Trace IDs don’t appear

- Confirm your edge forwards `traceparent`
- Ensure tracing is enabled (`OTEL_ENABLED=true`) and logs include `traceId`
- Validate incoming `traceparent` is correctly formatted

### Prometheus memory spikes

Most common cause:

- High-cardinality labels (using raw paths instead of templates)

Fix:

- Ensure the `route` label uses a route template (not `req.path`).

## See also

- [request-context](request-context)
- [metrics](metrics)
- [health-checks](health-checks)
- [log-correlation](log-correlation)
- [tracing](tracing)
