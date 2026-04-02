---
title: System Debugger
description: Runtime observability, storage, and optional dashboard UI for ZinTrust applications
---

# System Debugger

The `@zintrust/system-debugger` package adds application-level observability to ZinTrust. It records requests, queries, exceptions, jobs, cache activity, notifications, CLI events, outbound HTTP calls, and other runtime signals into debugger storage, then exposes those entries through an optional web dashboard.

The package works with both `zin s` and `zin s --wg`.

## What the package does

- Registers debugger watchers for core runtime events
- Persists debugger entries to your configured database connection
- Exposes CLI commands for migration, pruning, clearing, and status checks
- Provides an optional dashboard UI that you mount explicitly in your own routes

## Installation

```bash
yarn add @zintrust/system-debugger
```

Run the debugger migrations after installation:

```bash
zin migrate:debugger
```

## Runtime model

The package is intentionally split into two parts:

1. Runtime activation
   The plugin and register flow enable watchers and storage integration.
2. Dashboard activation
   The UI and debugger routes are mounted only if you register them yourself.

That means enabling `DEBUGGER_ENABLED=true` does not automatically expose the dashboard anymore.

## Quick start

### 1. Enable the runtime

Set the debugger env keys you need:

```env
DEBUGGER_ENABLED=true
DEBUGGER_DB_CONNECTION=
DEBUGGER_PRUNE_HOURS=24
DEBUGGER_SLOW_QUERY_MS=100
DEBUGGER_LOG_LEVEL=info
```

Then opt in through your project plugin file.

For Node:

```ts
// src/zintrust.plugins.ts
import '@zintrust/system-debugger/plugin';
```

For Workers:

```ts
// src/zintrust.plugins.wg.ts
import '@zintrust/system-debugger/plugin';
```

### 2. Mount the dashboard only when you want it

Use the lightweight UI entrypoint in your route file:

```ts
// routes/api.ts
import { registerDebuggerDashboard } from '@zintrust/system-debugger/ui';

registerDebuggerDashboard(router, {
  basePath: '/debugger',
  middleware: ['admin'],
});
```

This is the recommended path when you want the dashboard without importing the full package root re-export surface in route code.

## UI-only entrypoint

The package exposes a dedicated dashboard subpath:

```ts
import { registerDebuggerDashboard, registerDebuggerRoutes } from '@zintrust/system-debugger/ui';
```

Use it when you only need dashboard registration.

Use the root package when you need the runtime APIs such as `DebuggerConfig`, `DebuggerStorage`, `DebuggerContext`, or the watcher exports.

## Manual dashboard wiring

If you need direct storage control, use the lower-level route registration API:

```ts
import { useDatabase } from '@zintrust/core';
import { registerDebuggerRoutes } from '@zintrust/system-debugger/ui';
import { DebuggerStorage } from '@zintrust/system-debugger';

const db = useDatabase();

registerDebuggerRoutes(router, DebuggerStorage.resolveStorage(db), {
  basePath: '/debugger',
  middleware: ['admin'],
});
```

## CLI commands

When the package is installed, ZinTrust registers these commands:

```bash
zin migrate:debugger
zin debugger:status
zin debugger:prune --hours 24
zin debugger:clear
```

`zin debugger:status` reports:

- Whether the debugger is enabled by env
- The resolved debugger connection
- The configured retention window
- The expected dashboard URL if you mounted the routes
- Stored entry counts by type

## Migration packaging

The debugger package now publishes runnable JavaScript migrations under its package export for `./migrations`.

That matters because normal Node CLI execution should not depend on importing TypeScript files from `node_modules`. If an installed debugger package exposes TS-only migrations, ZinTrust now fails with a packaging-specific error instead of relying on unsupported runtime type-stripping behavior.

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

Per-watcher toggles can be overridden through `DebuggerConfig.merge(...)`.

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

- Always protect debugger routes with existing middleware such as `auth`, `admin`, or both.
- Prefer a dedicated debugger database connection in production.
- Leave `DEBUGGER_ENABLED=false` unless you actively need the debugger.
- Review the default redaction lists before enabling the debugger on sensitive endpoints.

## When to use it

Use `@zintrust/system-debugger` when you want:

- Local request and query tracing during development
- A structured debugging surface for background jobs and framework events
- A lightweight built-in dashboard without requiring a separate observability stack
- Optional UI exposure so each application decides whether the dashboard is mounted

For package-level implementation details and the full API surface, also see the package README in `packages/system-debugger/README.md`.