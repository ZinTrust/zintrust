# @zintrust/system-debugger

A debug assistant for ZinTrust. Records HTTP requests, database queries, exceptions, jobs, cache operations, scheduled tasks, mail, auth events, and more — all surfaced through a built-in web dashboard.

Works with both `zin s` (Node.js) and `zin s --wg` (Cloudflare Workers).

---

## Installation

```bash
yarn add @zintrust/system-debugger
```

Run the provided migrations to create the three required tables (`zin_debugger_entries`, `zin_debugger_entries_tags`, `zin_debugger_monitoring`):

```bash
zin migrate:debugger
```

You can still import the package migrations manually if you prefer to keep them inside your project migration entrypoint.

---

## Quick start

### 1. Enable via environment variables

```env
DEBUGGER_ENABLED=true
DEBUGGER_DB_CONNECTION=d1        # optional — omit to inherit DB_CONNECTION
DEBUGGER_PRUNE_HOURS=24          # how long entries are kept (default: 24)
DEBUGGER_SLOW_QUERY_MS=100       # slow-query threshold in ms (default: 100)
DEBUGGER_LOG_LEVEL=info          # minimum log level captured (default: info)
```

### 2. Enable the plugin in `zintrust.plugins.*`

The supported setup is to opt in through your ZinTrust plugin files, not a custom `src/start.ts` import.

For Node / standard runtime:

```ts
// src/zintrust.plugins.ts
import '@zintrust/system-debugger/plugin';
```

For Cloudflare Workers / `zin s --wg`, add the same plugin import to your Worker plugin file too:

```ts
// src/zintrust.plugins.wg.ts
import '@zintrust/system-debugger/plugin';

import { ProjectRuntime } from '@zintrust/core';
import serviceManifest from './bootstrap/service-manifest';

ProjectRuntime.set({ serviceManifest });
```

Why this is the preferred path:

- The plugin files are the framework-owned opt-in point that ZinTrust already auto-loads during boot.
- The core runtime can then lazy-load the debugger only after databases and the kernel are ready.
- The plugin activates debugger runtime logic only; the dashboard route stays inactive until you register it yourself.

With the stock ZinTrust bootstrap, `DEBUGGER_ENABLED=true` plus the plugin import above activates the watchers and storage integration. Dashboard UI/routes are a separate route-level opt-in.

### 3. Mount the dashboard

Register the dashboard explicitly in your route file when you want the UI. Restrict access with middleware — the debugger does **not** apply auth automatically.

```ts
// routes/api.ts
import { registerDebuggerDashboard } from '@zintrust/system-debugger/ui';

registerDebuggerDashboard(router, {
  basePath: '/debugger', // default
  middleware: ['admin'], // apply your auth middleware here
});
```

The dashboard SPA will be available at `GET /debugger` (or your chosen `basePath`).

If you need custom storage wiring, keep using the low-level route registrar:

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

If you need a manual late bootstrap instead of plugin-driven activation, you can still import `@zintrust/system-debugger/register` yourself, but that is the advanced path rather than the default project setup.

## CLI commands

When the optional package is installed, ZinTrust auto-registers these commands:

```bash
zin migrate:debugger
zin debugger:status
zin debugger:prune --hours 24
zin debugger:clear
```

`zin debugger:status` reports the active connection, retention window, current entry counts, and the expected dashboard URL derived from your current env and route choices.

---

## Watchers

All 20 watchers are enabled by default when `DEBUGGER_ENABLED=true`. Disable individual watchers via `DebuggerConfig.merge()` or environment-based overrides.

| Watcher               | Captures                                            |
| --------------------- | --------------------------------------------------- |
| `HttpWatcher`         | Incoming HTTP requests and responses                |
| `QueryWatcher`        | SQL queries, execution time, slow-query flag        |
| `ExceptionWatcher`    | Unhandled exceptions with stack traces              |
| `LogWatcher`          | Application log entries (filtered by `logMinLevel`) |
| `JobWatcher`          | Background job dispatches and completions           |
| `CacheWatcher`        | Cache hits, misses, writes, and deletes             |
| `ScheduleWatcher`     | Scheduled task runs                                 |
| `MailWatcher`         | Outgoing mail dispatches                            |
| `AuthWatcher`         | Login, logout, and auth attempts                    |
| `EventWatcher`        | Application events fired and listeners called       |
| `ModelWatcher`        | ORM model creates, updates, and deletes             |
| `NotificationWatcher` | Notification dispatches                             |
| `RedisWatcher`        | Redis commands                                      |
| `GateWatcher`         | Gate and policy checks                              |
| `MiddlewareWatcher`   | Middleware chain execution                          |
| `CommandWatcher`      | CLI command invocations                             |
| `BatchWatcher`        | Batch job processing                                |
| `DumpWatcher`         | Explicit `dump()` calls                             |
| `ViewWatcher`         | View renders                                        |
| `HttpClientWatcher`   | Outgoing HTTP client requests                       |

---

## Programmatic / custom wiring

If you need fine-grained control instead of auto-registration, compose the pieces manually:

```ts
import {
  DebuggerConfig,
  DebuggerStorage,
  DebuggerContext,
  HttpWatcher,
  QueryWatcher,
  ExceptionWatcher,
} from '@zintrust/system-debugger';

const config = DebuggerConfig.merge({
  enabled: true,
  pruneAfterHours: 48,
  slowQueryThreshold: 200,
  watchers: {
    // disable specific watchers
    redis: false,
    view: false,
  },
  redaction: {
    body: ['password', 'secret', 'token'],
  },
});

const db = useDatabase();
const storage = DebuggerStorage.resolveStorage(db);

HttpWatcher.register({ storage, config, db });
QueryWatcher.register({ storage, config, db });
ExceptionWatcher.register({ storage, config, db });
```

---

## Configuration reference

`DebuggerConfig.merge(overrides?)` accepts the following options:

| Option               | Type                                                | Default                             | Description                                                          |
| -------------------- | --------------------------------------------------- | ----------------------------------- | -------------------------------------------------------------------- |
| `enabled`            | `boolean`                                           | `false`                             | Master switch — no watchers activate when `false`                    |
| `connection`         | `string \| undefined`                               | `undefined`                         | Named DB connection for storing entries; uses `'default'` if omitted |
| `pruneAfterHours`    | `number`                                            | `24`                                | Entries older than this are pruned                                   |
| `slowQueryThreshold` | `number`                                            | `100`                               | Queries taking longer (ms) are flagged as slow                       |
| `logMinLevel`        | `'debug' \| 'info' \| 'warn' \| 'error' \| 'fatal'` | `'info'`                            | Minimum log severity captured                                        |
| `ignoreRoutes`       | `string[]`                                          | `['/debugger', '/health', '/ping']` | Routes excluded from HTTP watcher                                    |
| `watchers`           | `Record<string, boolean>`                           | `{}`                                | Per-watcher enable/disable flags (`false` = disabled)                |
| `redaction.headers`  | `string[]`                                          | `['authorization', 'cookie', ...]`  | Request header names to redact                                       |
| `redaction.body`     | `string[]`                                          | `['password', 'token', ...]`        | Request body keys to redact                                          |
| `redaction.query`    | `string[]`                                          | `[]`                                | Query-string keys to redact                                          |

---

## Entry types

```ts
import { EntryType } from '@zintrust/system-debugger';

EntryType.REQUEST; // 'request'
EntryType.QUERY; // 'query'
EntryType.EXCEPTION; // 'exception'
EntryType.LOG; // 'log'
EntryType.JOB; // 'job'
EntryType.CACHE; // 'cache'
EntryType.SCHEDULE; // 'schedule'
EntryType.MAIL; // 'mail'
EntryType.AUTH; // 'auth'
EntryType.EVENT; // 'event'
EntryType.MODEL; // 'model'
EntryType.NOTIFICATION; // 'notification'
EntryType.REDIS; // 'redis'
EntryType.GATE; // 'gate'
EntryType.MIDDLEWARE; // 'middleware'
EntryType.COMMAND; // 'command'
EntryType.BATCH; // 'batch'
EntryType.DUMP; // 'dump'
EntryType.VIEW; // 'view'
EntryType.CLIENT_REQUEST; // 'client_request'
```

---

## API surface

```ts
// Preferred plugin opt-in for stock ZinTrust boot
import '@zintrust/system-debugger/plugin';

// Advanced late bootstrap import for runtime hooks only
import '@zintrust/system-debugger/register';

// Lightweight dashboard/UI-only entrypoint
import { registerDebuggerDashboard, registerDebuggerRoutes } from '@zintrust/system-debugger/ui';

// Named exports
import {
  DebuggerConfig, // configuration factory + merge helper
  DebuggerStorage, // storage facade (read/write entries)
  DebuggerContext, // per-request context (userId, batchId)
  EntryType, // sealed enum of entry types
  // individual watchers...
  HttpWatcher,
  QueryWatcher,
  ExceptionWatcher,
  LogWatcher,
  JobWatcher,
  CacheWatcher,
  ScheduleWatcher,
  MailWatcher,
  AuthWatcher,
  EventWatcher,
  ModelWatcher,
  NotificationWatcher,
  RedisWatcher,
  GateWatcher,
  MiddlewareWatcher,
  CommandWatcher,
  BatchWatcher,
  DumpWatcher,
  ViewWatcher,
  HttpClientWatcher,
} from '@zintrust/system-debugger';
```

---

## Security considerations

- **Always** protect the dashboard with middleware (e.g. `middleware: ['admin']`). `@zintrust/system-debugger/ui` exports `registerDebuggerDashboard(...)` and `registerDebuggerRoutes(...)`, and neither applies any authentication by default.
- Sensitive fields in request headers and body are redacted using the `redaction` config before being stored. Review and extend the default redaction lists to match your application's data model.
- Use a **dedicated database connection** (`DEBUGGER_DB_CONNECTION`) in production so debugger writes cannot impact your primary DB connection pool.
- Keep `DEBUGGER_ENABLED=false` (or unset) in production unless actively investigating an issue.

---

## Peer dependencies

| Package          | Version   |
| ---------------- | --------- |
| `@zintrust/core` | `^0.4.41` |
