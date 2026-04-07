---
title: Trace
description: Runtime observability, storage, and optional dashboard UI for ZinTrust applications
---

# Trace

The `@zintrust/trace` package adds application-level observability to ZinTrust. It records requests, queries, exceptions, jobs, cache activity, notifications, CLI events, outbound HTTP calls, and other runtime signals into trace storage, then exposes those entries through an optional web dashboard.

The package works with both `zin s` and `zin s --wg`.

## What the package does

- Registers trace watchers for core runtime events
- Persists trace entries to your configured database connection
- Exposes CLI commands for migration, pruning, clearing, and status checks
- Provides an optional dashboard UI that you either mount explicitly in your own routes or let core auto-mount when `TRACE_AUTO_MOUNT=true`

## Installation

```bash
npm install @zintrust/trace
```

Run the trace migrations after installation:

```bash
zin migrate:trace
```

## Runtime model

The package is intentionally split into two parts:

1. Runtime activation
   The plugin and register flow enable watchers and storage integration.
2. Dashboard activation
   The UI and trace routes are mounted only if you register them yourself, unless you explicitly opt into the stock bootstrap auto-mount path.

That means enabling `TRACE_ENABLED=true` does not automatically expose the dashboard by itself.

## Quick start

### 1. Enable the runtime

Set the trace env keys you need:

```env
TRACE_ENABLED=true
TRACE_AUTO_MOUNT=true         # optional — stock bootstrap auto-mounts /trace when true
TRACE_DB_CONNECTION=
TRACE_PRUNE_HOURS=24
TRACE_SLOW_QUERY_MS=100
TRACE_LOG_LEVEL=info
```

Then opt in through your project plugin file.

For Node:

```ts
// src/zintrust.plugins.ts
import '@zintrust/trace/plugin';
```

For Workers:

```ts
// src/zintrust.plugins.wg.ts
import '@zintrust/trace/plugin';
```

### 2. Mount the dashboard only when you want it

Use the lightweight UI entrypoint in your route file:

```ts
// routes/api.ts
import { registerTraceDashboard } from '@zintrust/trace/ui';

registerTraceDashboard(router, {
  basePath: '/trace',
  middleware: ['admin'],
});
```

This is the recommended path when you want the dashboard without importing the full package root re-export surface in route code.

## Optional bootstrap auto-mount

If you want the stock ZinTrust bootstrap to expose the dashboard without editing your route file, opt in explicitly:

```env
TRACE_ENABLED=true
TRACE_AUTO_MOUNT=true
TRACE_BASE_PATH=/trace
TRACE_MIDDLEWARE=auth,admin
```

`TRACE_AUTO_MOUNT` defaults to off. When it is on, core mounts `registerTraceDashboard(...)` during bootstrap using `TRACE_BASE_PATH` and the optional comma-separated `TRACE_MIDDLEWARE` list.

## UI-only entrypoint

The package exposes a dedicated dashboard subpath:

```ts
import { registerTraceDashboard, registerTraceRoutes } from '@zintrust/trace/ui';
```

Use it when you only need dashboard registration.

Use the root package when you need the runtime APIs such as `TraceConfig`, `TraceStorage`, `TraceContext`, or the watcher exports.

## Manual dashboard wiring

If you need direct storage control, use the lower-level route registration API:

```ts
import { useDatabase } from '@zintrust/core';
import { registerTraceRoutes } from '@zintrust/trace/ui';
import { TraceStorage } from '@zintrust/trace';

const db = useDatabase();

registerTraceRoutes(router, TraceStorage.resolveStorage(db), {
  basePath: '/trace',
  middleware: ['admin'],
});
```

## CLI commands

When the package is installed, ZinTrust registers these commands:

```bash
zin migrate:trace
zin trace:status
zin trace:prune --hours 24
zin trace:clear
```

`zin trace:status` reports:

- Whether the trace is enabled by env
- The resolved trace connection
- The configured retention window
- The expected dashboard URL if you mounted the routes
- Stored entry counts by type

## Migration packaging

The trace package now publishes runnable JavaScript migrations under its package export for `./migrations`.

That matters because normal Node CLI execution should not depend on importing TypeScript files from `node_modules`. If an installed trace package exposes TS-only migrations, ZinTrust now fails with a packaging-specific error instead of relying on unsupported runtime type-stripping behavior.

## Watchers

The package enables a broad set of watchers when the runtime is active, including:

- `HttpWatcher`
- `QueryWatcher`
- `ExceptionWatcher`
- `LogWatcher`
- `JobWatcher`
- `CacheWatcher`
- `ScheduleWatcher`
- `MailWatcher`
- `AuthWatcher`
- `EventWatcher`
- `ModelWatcher`
- `NotificationWatcher`
- `RedisWatcher`
- `GateWatcher`
- `MiddlewareWatcher`
- `CommandWatcher`
- `BatchWatcher`
- `DumpWatcher`
- `ViewWatcher`
- `HttpClientWatcher`

Per-watcher toggles can be overridden through `TraceConfig.merge(...)`.

## Configuration

Key config knobs include:

- `enabled`
- `connection`
- `pruneAfterHours`
- `slowQueryThreshold`
- `logMinLevel`
- `ignoreRoutes`
- `watchers`
- `redaction.headers`
- `redaction.body`
- `redaction.query`

For project-level overrides, keep the package defaults in the package and adjust only the values you need in your application config.

## Security guidance

- Always protect trace routes with existing middleware such as `auth`, `admin`, or both.
- Prefer a dedicated trace database connection in production.
- Leave `TRACE_ENABLED=false` unless you actively need the trace.
- Review the default redaction lists before enabling the trace on sensitive endpoints.

## When to use it

Use `@zintrust/trace` when you want:

- Local request and query tracing during development
- A structured debugging surface for background jobs and framework events
- A lightweight built-in dashboard without requiring a separate observability stack
- Optional UI exposure so each application decides whether the dashboard is mounted

For package-level implementation details and the full API surface, also see the package README in `@zintrust/trace/README.md`.
