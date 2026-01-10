# Metrics (Prometheus)

Zintrust can expose **Prometheus-compatible metrics** for:

- HTTP request volume and latency
- DB query volume and latency (where supported)
- Default runtime/process metrics (when enabled)

Metrics are intentionally **optional** and **best-effort**:

- If `prom-client` is not installed, metrics initialization fails gracefully.
- If metrics are disabled in config, the metrics endpoint is not registered.

Primary sources:

- `routes/metrics.ts` (endpoint registration)
- `src/observability/PrometheusMetrics.ts` (metric definitions and recording)

## Enabling metrics

### Environment configuration

- `METRICS_ENABLED`
  - `true` enables the metrics endpoint
  - Any other value disables it
- `METRICS_PATH`
  - Optional override for the scrape path
  - Default is `/metrics`

Example:

```bash
METRICS_ENABLED=true
METRICS_PATH=/metrics
```

## Endpoint

When enabled, the app registers a GET route at `METRICS_PATH` (default `/metrics`).

- Response format: Prometheus exposition format (text)
- Content-Type: provided by `prom-client` registry (`register.contentType`)

## What metrics are emitted

Zintrust defines these core application metrics:

### HTTP

- Counter: `http_requests_total`
  - Meaning: total number of HTTP requests completed
  - Labels:
    - `method` (e.g. `GET`)
    - `route` (route template when known)
    - `status` (HTTP status code as string)

- Histogram: `http_request_duration_seconds`
  - Meaning: request duration in seconds
  - Same labels as above

Why histogram:

- Supports tail latency queries and SLOs via `histogram_quantile`

### Database

- Counter: `db_queries_total`
  - Meaning: total number of DB queries observed
  - Labels:
    - `driver` (low-cardinality identifier of the DB adapter)

- Histogram: `db_query_duration_seconds`
  - Meaning: DB query duration in seconds
  - Same label set (`driver`)

### Default metrics

When available, `PrometheusMetrics.init()` enables `prom-client` default metrics (process/runtime gauges). These are useful for CPU/memory dashboards, but depend on runtime support.

## How metrics are recorded

### HTTP recording (kernel-driven)

The HTTP kernel records HTTP metrics near the end of the request lifecycle.

Inputs:

- `method`: from the request
- `route`: should be a **route template** (e.g. `/api/users/:id`), not a raw path
- `status`: final status code
- `durationSeconds`: computed from request start/end timestamps

This means controllers generally do not need to emit metrics.

### DB recording

DB adapters (or the ORM layer) record query metrics where supported. The `driver` label is intentionally low-cardinality.

## PromQL examples

### Request rate

```promql
sum(rate(http_requests_total[5m]))
```

By route:

```promql
sum by (route) (rate(http_requests_total[5m]))
```

### Error ratio (5xx)

```promql
sum(rate(http_requests_total{status=~"5.."}[5m]))
/
sum(rate(http_requests_total[5m]))
```

### p95 latency by route

```promql
histogram_quantile(
	0.95,
	sum by (le, route) (rate(http_request_duration_seconds_bucket[5m]))
)
```

### p95 DB query latency by driver

```promql
histogram_quantile(
	0.95,
	sum by (le, driver) (rate(db_query_duration_seconds_bucket[5m]))
)
```

## Label cardinality guidance

Prometheus performance depends heavily on label cardinality.

Do:

- Use **route templates** for the `route` label.
- Keep `driver` to a small fixed set.

Avoid:

- Raw URL paths (`/users/123`) or query strings as labels
- `requestId`, `traceId`, `userId`, `tenantId` as labels
- Arbitrary header values as labels

Use logs and tracing for per-request correlation.

## Operations

### Scraping

Point Prometheus (or an agent) at `METRICS_PATH` on your service.

If you override `METRICS_PATH`, update the scrape config accordingly.

### Securing `/metrics`

In production, `/metrics` should usually be restricted:

- Cluster-internal only (preferred)
- Or protected by middleware (IP allowlist / auth) if needed

Avoid exposing process metrics to the public internet.

## Troubleshooting

### `/metrics` returns 404

- Confirm `METRICS_ENABLED=true`
- Confirm you’re requesting the configured `METRICS_PATH`

### `/metrics` errors or is empty

- Confirm `prom-client` is installed and importable
- Check startup logs for a warning from metrics initialization

### Prometheus memory usage spikes

Most common cause:

- High-cardinality `route` labels (accidentally using raw paths)

Fix:

- Ensure the route label is derived from route templates (not raw `req.path`).

## See also

- [docs/observability.md](docs/observability.md)
- [docs/health-checks.md](docs/health-checks.md)
- [docs/log-correlation.md](docs/log-correlation.md)
