# Health Checks

Zintrust ships **health endpoints** suitable for container orchestrators (Kubernetes, ECS, Nomad) and load balancers.

These routes are registered by `registerHealthRoutes(...)` in `routes/health.ts`:

- `GET /health` — "overall" service health (includes a database ping)
- `GET /health/live` — liveness (process is running)
- `GET /health/ready` — readiness (dependencies are reachable and responding)

## Which endpoint to use

Use the endpoints with intent:

- **`/health/live`** answers: "Should this process be restarted?" It does not touch external dependencies.
- **`/health/ready`** answers: "Should this instance receive traffic?" It probes dependencies.
- **`/health`** is a simpler dependency-aware health check and is also used in some examples/containers.

In Kubernetes terms:

- `livenessProbe` → `/health/live`
- `readinessProbe` → `/health/ready`

## Endpoint behavior (what Zintrust actually does)

### `GET /health`

Implementation summary:

- Resolves the DB instance via `useDatabase()`.
- If the adapter supports it, it will call `db.isConnected()` and then `db.connect()` if needed.
- Performs a DB liveness ping using `QueryBuilder.ping(db)`.
- Returns:
  - `200` with `{ status: 'healthy', database: 'connected', ... }` on success
  - `503` with `{ status: 'unhealthy', database: 'disconnected', error: ... }` on failure

Response shape (success):

```json
{
  "status": "healthy",
  "timestamp": "2026-01-01T00:00:00.000Z",
  "uptime": 123.456,
  "database": "connected",
  "environment": "development"
}
```

Response shape (failure):

```json
{
  "status": "unhealthy",
  "timestamp": "2026-01-01T00:00:00.000Z",
  "database": "disconnected",
  "error": "Service unavailable"
}
```

Notes:

- `environment` is computed from `Env.NODE_ENV ?? 'development'`.
- `uptime` uses `process.uptime()` when available, otherwise `0` (useful in edge runtimes).
- On failure, the log line is emitted via `Logger.error('Health check failed:', error)`.

### `GET /health/live`

Implementation summary:

- Returns process liveness only.
- Never probes DB / cache.
- Always returns `200`.

Response shape:

```json
{
  "status": "alive",
  "timestamp": "2026-01-01T00:00:00.000Z",
  "uptime": 123.456
}
```

### `GET /health/ready`

Implementation summary:

- Uses `appConfig.environment` (not `Env.NODE_ENV`) for the `environment` field.
- Probes the DB via `QueryBuilder.ping(db)` (including the same connect-if-needed logic as `/health`).
- Optionally probes cache:
  - Calls `RuntimeHealthProbes.pingKvCache(2000)`.
  - If it returns a number, `cache` is included under `dependencies`.
  - If it returns `null`, the `cache` dependency is omitted.
- Returns:
  - `200` + `status: 'ready'` on success
  - `503` + `status: 'not_ready'` on failure

Response shape (success):

```json
{
  "status": "ready",
  "timestamp": "2026-01-01T00:00:00.000Z",
  "environment": "development",
  "dependencies": {
    "database": { "status": "ready", "responseTime": 5 },
    "cache": { "status": "ready", "responseTime": 12 }
  }
}
```

Response shape (failure):

```json
{
  "status": "not_ready",
  "timestamp": "2026-01-01T00:00:00.000Z",
  "environment": "production",
  "dependencies": {
    "database": { "status": "unavailable", "responseTime": 100 },
    "cache": { "status": "unavailable", "responseTime": 100 }
  },
  "error": "Service unavailable"
}
```

Notes:

- On failure, the route logs `Logger.error('Readiness check failed:', error)`.
- Cache is only included on failure when `RuntimeHealthProbes.getCacheDriverName() === 'kv'`.

## Production behavior (error redaction)

Zintrust intentionally reduces error detail in production-like environments.

- `/health`: treats both `production` and `prod` as production.
- `/health/ready`: treats `production` as production.

In production, `error` becomes a generic `"Service unavailable"`.
In non-production, `error` is the thrown error message.

This reduces information disclosure to unauthenticated callers and keeps probes safe to expose.

## Example probe commands

```bash
curl -sS http://localhost:3000/health | jq
curl -sS http://localhost:3000/health/live | jq
curl -sS http://localhost:3000/health/ready | jq
```

## Kubernetes example

```yaml
livenessProbe:
	httpGet:
		path: /health/live
		port: 3000
	initialDelaySeconds: 5
	periodSeconds: 10

readinessProbe:
	httpGet:
		path: /health/ready
		port: 3000
	initialDelaySeconds: 5
	periodSeconds: 10
```

## Troubleshooting

If `/health` or `/health/ready` returns `503`:

- Check DB connectivity and credentials (and whether your adapter supports `connect()` / `isConnected()`).
- Verify migrations have run (a DB can be reachable but unusable).
- If you expect cache probing, confirm your cache driver is configured to `kv` so it will be probed/reported.

If probes are flapping:

- Increase readiness probe timeouts in your orchestrator.
- Consider warming connections at boot (see startup config validation and boot-time checks).
