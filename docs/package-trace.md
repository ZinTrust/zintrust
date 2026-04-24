---
title: Trace
description: Runtime observability, storage, and optional dashboard UI for ZinTrust applications
---

# Trace

The `@zintrust/trace` package adds application-level observability to ZinTrust. It records requests, queries, exceptions, jobs, cache activity, notifications, CLI events, outbound HTTP calls, and other runtime signals into trace storage, then exposes those entries through an optional web dashboard.

Package docs URL: https://zintrust.com/package-trace

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
TRACE_QUERY_CONNECTION=
TRACE_SERVICE_TAG=
TRACE_PROXY=false
TRACE_PROXY_URL=
TRACE_PROXY_PATH=/zin/trace/write
TRACE_PROXY_KEY_ID=
TRACE_PROXY_SECRET=
TRACE_PROXY_TIMEOUT_MS=30000
TRACE_PRUNE_HOURS=24
TRACE_SLOW_QUERY_MS=100
TRACE_LOG_LEVEL=info
TRACE_CACHE_PAYLOADS=false
TRACE_QUERY_BINDINGS=true
TRACE_CONTENT_QUEUE_DRIVER=
TRACE_CONTENT_QUEUE_NAME=trace-content
TRACE_CONTENT_QUEUE_ENQUEUE_TIMEOUT_MS=25
TRACE_CONTENT_QUEUE_WORKER_ENABLED=true
TRACE_CONTENT_QUEUE_WORKER_INTERVAL_MS=1000
TRACE_CONTENT_QUEUE_WORKER_MAX_DURATION_MS=250
TRACE_CONTENT_QUEUE_WORKER_CONCURRENCY=1
TRACE_REDACT_KEYS=password,token,secret
TRACE_REDACT_HEADERS=authorization,cookie
TRACE_REDACT_BODY=password,token,secret
TRACE_REDACT_QUERY=
```

When `TRACE_CONTENT_QUEUE_DRIVER` is set, trace writes enqueue through that registered queue driver and an internal trace drain worker handles persistence outside the live request path. If it is not set, oversized trace content is replaced with `Trace content exceeded budget and was replaced.` instead of using the heavier inline compaction path.

When `TRACE_PROXY=true`, the runtime still builds the normal trace write payload locally, but it sends the write/update/family-stale operations to a remote signed trace gateway instead of writing to the local trace database. `TRACE_SERVICE_TAG` is appended once to outgoing trace entries and falls back to `APP_NAME` when empty.

That means the current architecture already supports Redis or any other registered async queue driver. First-class Cloudflare Queue support still requires a dedicated queue driver plus queue-runtime registration for that transport.

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

### 3. Optional remote ingest server

If you want a dedicated trace server, mount the signed ingest gateway there:

```ts
import { registerTraceIngestGateway } from '@zintrust/trace';

registerTraceIngestGateway(router, {
  basePath: '/zin/trace/write',
});
```

The sender app uses `TRACE_PROXY_URL` plus `TRACE_PROXY_PATH` for transport, and the trace server verifies requests with `TRACE_PROXY_KEY_ID` + `TRACE_PROXY_SECRET` or their `APP_NAME` + `APP_KEY` fallbacks. The gateway writes through the normal `TraceStorage` implementation after signature verification.

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
- `serviceTag`
- `proxy.enabled`
- `proxy.url`
- `proxy.path`
- `proxy.keyId`
- `proxy.secret`
- `proxy.timeoutMs`
- `pruneAfterHours`
- `slowQueryThreshold`
- `logMinLevel`
- `captureCachePayloads`
- `captureQueryBindings`
- `contentDispatch.driver`
- `contentDispatch.queueName`
- `contentDispatch.enqueueTimeoutMs`
- `contentDispatch.worker.enabled`
- `contentDispatch.worker.intervalMs`
- `contentDispatch.worker.maxDurationMs`
- `contentDispatch.worker.concurrency`
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

## Marking logs as non-traceable

Most application logs should remain traceable. Only mark a log as non-traceable when that log is about the trace transport itself, a low-level proxy/queue transport, or another internal diagnostic path that would otherwise create trace recursion or excessive self-noise.

The reserved context flag is `__zintrustSkipTraceLog: true`. In normal framework or app code, prefer the public helper instead of setting that key by hand:

```ts
import { Logger } from '@config/logger';

Logger.warn('HTTP queue enqueue failed; storing tracker fallback in memory', {
  ...Logger.withTraceSkipContext({
    queue,
    fallbackJobId,
    error: error instanceof Error ? error.message : String(error),
  }),
});
```

Use this for logs such as:

- Low-level proxy request failures
- Raw SQL transport diagnostics emitted below the normal query watcher layer
- Queue fallback and recovery warnings
- Trace storage degradation warnings

Avoid using it for normal controller, service, middleware, auth, or domain logs. Those logs are usually the ones developers want to see inside the trace dashboard.

### Local wrapper pattern

Sometimes a module wants a small local helper that always carries the reserved flag and keeps module-specific call sites short. The proxy layer uses that pattern in `ProxyServerUtils.ts` with `withTraceSkipProxyContext(...)`:

```ts
const withTraceSkipProxyContext = (context: Record<string, unknown>): Record<string, unknown> => ({
  ...context,
  __zintrustSkipTraceLog: true,
});

Logger.warn(`[${serviceName}] Signature verification failed`, {
  ...withTraceSkipProxyContext({
    path: req.url ?? '',
    method: req.method ?? 'POST',
    status: error.status,
    message: error.message,
  }),
});
```

That local wrapper is useful when:

- A module emits several related low-level diagnostics
- The module wants a domain-specific helper name such as `withTraceSkipProxyContext(...)`
- Test doubles or local typing are easier with a tiny wrapper than with repeated direct logger helper calls

If you do not need a module-specific wrapper, use `Logger.withTraceSkipContext(...)` directly.

### Useful examples

Proxy transport failure:

```ts
Logger.error('[MySQLProxyAdapter] Proxy request failed', {
  ...Logger.withTraceSkipContext({
    path,
    baseUrl: state.settings.baseUrl,
    timeoutMs: state.settings.timeoutMs,
    error: loggedError.message,
  }),
});
```

Queue fallback warning:

```ts
Logger.warn('Job marked pending recovery in tracker', {
  ...Logger.withTraceSkipContext({
    queue,
    jobId: fallbackJobId,
  }),
});
```

Raw SQL transport diagnostic:

```ts
Logger.warn(`Raw SQL Query executed: ${sql}`, Logger.withTraceSkipContext({ sql, parameters }));
```

### Rule of thumb

Ask one question before using the helper: if this log is captured by trace, will it create a feedback loop, duplicate a lower-level signal, or flood the dashboard with transport noise? If the answer is yes, mark it with the trace-skip context. Otherwise, leave it as a normal traceable log.

## When to use it

Use `@zintrust/trace` when you want:

- Local request and query tracing during development
- A structured debugging surface for background jobs and framework events
- A lightweight built-in dashboard without requiring a separate observability stack
- Optional UI exposure so each application decides whether the dashboard is mounted

For package-level implementation details and the full API surface, also see the package README in `@zintrust/trace/README.md`.
