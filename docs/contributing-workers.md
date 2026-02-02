# Contributing: Cloudflare Workers

This guide explains how to run Workers-focused tests locally.

## Prerequisites

- Node.js 20+
- Wrangler CLI
- Docker (for local PostgreSQL/MySQL/Redis)

## Local Setup

```bash
npm install
```

### Miniflare Harness

Miniflare is used for Workers integration tests.

```bash
npm run test:workers
```

### Durable Object shutdown binding

For graceful shutdown coordination across Workers, add this binding to your wrangler config:

```jsonc
"durable_objects": {
	"bindings": [
		{ "name": "WORKER_SHUTDOWN", "class_name": "WorkerShutdownDurableObject" }
	]
},
"migrations": [
	{ "tag": "v1", "new_classes": ["WorkerShutdownDurableObject"] }
]
```

### PostgreSQL (optional)

Set the environment variables to enable integration tests:

- `WORKERS_PG_HOST`
- `WORKERS_PG_PORT`
- `WORKERS_PG_DATABASE`
- `WORKERS_PG_USER`
- `WORKERS_PG_PASSWORD`

Example:

```bash
export WORKERS_PG_HOST=127.0.0.1
export WORKERS_PG_PORT=5432
export WORKERS_PG_DATABASE=postgres
export WORKERS_PG_USER=postgres
export WORKERS_PG_PASSWORD=postgres
npm run test:workers
```
