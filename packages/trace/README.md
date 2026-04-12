# @zintrust/trace

A debug assistant for ZinTrust. Records HTTP requests, database queries, exceptions, jobs, cache operations, scheduled tasks, mail, auth events, and more — all surfaced through a built-in web dashboard.

Docs: https://zintrust.com/package-trace

Works with both `zin s` (Node.js) and `zin s --wg` (Cloudflare Workers).

---

## Installation

```bash
npm install @zintrust/trace
```

Run the provided migrations to create the three required tables (`zin_trace_entries`, `zin_trace_entries_tags`, `zin_trace_monitoring`):

```bash
zin migrate:trace
```

You can still import the package migrations manually if you prefer to keep them inside your project migration entrypoint.

---

## Quick start

### 1. Enable via environment variables

```env
TRACE_ENABLED=true
TRACE_DB_CONNECTION=d1        # optional — omit to inherit DB_CONNECTION
TRACE_QUERY_CONNECTION=main   # optional — app DB to observe for SQL traces
TRACE_PRUNE_HOURS=24          # how long entries are kept (default: 24)
TRACE_SLOW_QUERY_MS=100       # slow-query threshold in ms (default: 100)
TRACE_LOG_LEVEL=info          # minimum log level captured (default: info)
TRACE_CACHE_PAYLOADS=false    # optional — include cache payload values in trace entries
TRACE_QUERY_BINDINGS=true     # optional — include SQL binding values in query traces
TRACE_CONTENT_QUEUE_DRIVER=   # optional — any registered async queue driver for trace offload
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

When `TRACE_CONTENT_QUEUE_DRIVER` is set, trace writes enqueue through that registered queue driver and an internal trace worker drains them outside the live request path. When it is unset, oversized content is replaced with `Trace content exceeded budget and was replaced.` before persistence instead of running the heavy compaction loop inline.

This currently works with any queue driver already registered in ZinTrust. First-class Cloudflare Queue support still requires a dedicated queue driver and queue-runtime registration for that transport.

### 2. Enable the plugin in `zintrust.plugins.*`

The supported setup is to opt in through your ZinTrust plugin files, not a custom `src/start.ts` import.

For Node / standard runtime:

```ts
// src/zintrust.plugins.ts
import '@zintrust/trace/plugin';
```

For Cloudflare Workers / `zin s --wg`, add the same plugin import to your Worker plugin file too:

```ts
// src/zintrust.plugins.wg.ts
import '@zintrust/trace/plugin';

import { ProjectRuntime } from '@zintrust/core';
import serviceManifest from './bootstrap/service-manifest';

ProjectRuntime.set({ serviceManifest });
```

Why this is the preferred path:

- The plugin files are the framework-owned opt-in point that ZinTrust already auto-loads during boot.
- The core runtime can then lazy-load the trace only after databases and the kernel are ready.
- The plugin activates trace runtime logic only; the dashboard route stays inactive until you register it yourself.

With the stock ZinTrust bootstrap, `TRACE_ENABLED=true` plus the plugin import above activates the watchers and storage integration. Dashboard UI/routes are still a separate opt-in unless you also set `TRACE_AUTO_MOUNT=true`.

### Optional: configure filters in `config/trace.ts`

If you prefer project-owned trace configuration over env-only setup, put the filter rules directly in `config/trace.ts`.

```ts
// config/trace.ts
import { Env } from '@config/env';
import type { TraceConfigOverrides } from '@zintrust/trace';

export default {
  enabled: Env.getBool('TRACE_ENABLED', false),
  connection: Env.get('TRACE_DB_CONNECTION', '') || undefined,
  observeConnection: Env.get('TRACE_QUERY_CONNECTION', '') || undefined,
  pruneAfterHours: Env.getInt('TRACE_PRUNE_HOURS', 24),
  slowQueryThreshold: Env.getInt('TRACE_SLOW_QUERY_MS', 100),
  logMinLevel: Env.get('TRACE_LOG_LEVEL', 'info') as TraceConfigOverrides['logMinLevel'],
  captureCachePayloads: Env.getBool('TRACE_CACHE_PAYLOADS', false),
  captureQueryBindings: Env.getBool('TRACE_QUERY_BINDINGS', true),
  contentDispatch: {
    driver: Env.get('TRACE_CONTENT_QUEUE_DRIVER', '') || undefined,
    queueName: Env.get('TRACE_CONTENT_QUEUE_NAME', 'trace-content'),
    enqueueTimeoutMs: Env.getInt('TRACE_CONTENT_QUEUE_ENQUEUE_TIMEOUT_MS', 25),
    worker: {
      enabled: Env.getBool('TRACE_CONTENT_QUEUE_WORKER_ENABLED', true),
      intervalMs: Env.getInt('TRACE_CONTENT_QUEUE_WORKER_INTERVAL_MS', 1000),
      maxDurationMs: Env.getInt('TRACE_CONTENT_QUEUE_WORKER_MAX_DURATION_MS', 250),
      concurrency: Env.getInt('TRACE_CONTENT_QUEUE_WORKER_CONCURRENCY', 1),
    },
  },
  watchers: {
    request: {
      get: { exclude: ['report'] },
      post: { include: ['auth'] },
      patch: { include: ['profile'] },
      delete: { exclude: ['internal'] },
    },
    log: { exclude: ['healthcheck'] },
    exception: { include: ['trace'] },
    cache: { include: ['session:'] },
  },
  redaction: {
    keys: ['password', 'token', 'secret'],
    headers: ['authorization', 'cookie'],
    body: ['password', 'token', 'secret'],
    query: [],
  },
} satisfies TraceConfigOverrides;
```

All include/exclude matching is contains-based, so a term like `report` matches `/reports/daily`, `monthly-report`, or any other trace content containing that fragment.

When trace storage lives on a different connection than your application data, keep `TRACE_DB_CONNECTION` pointed at the trace tables and set `TRACE_QUERY_CONNECTION` to the app connection you want SQL traces to observe. If you omit `TRACE_QUERY_CONNECTION`, trace automatically falls back to the main `DB_CONNECTION` whenever the storage connection is different.

When ZinTrust proxy runtimes also have trace enabled, proxy-executed SQL and SMTP operations are traced at the proxy boundary too. That means MySQL, PostgreSQL, SQL Server, and D1 proxy requests can still record the final SQL plus bound values, and the SMTP proxy can persist rendered mail text and HTML, even when the consumer application is talking to the proxy rather than executing the transport locally.

### 3. Mount the dashboard

Register the dashboard explicitly in your route file when you want the UI. Restrict access with middleware — the trace does **not** apply auth automatically.

```ts
// routes/api.ts
import { registerTraceDashboard } from '@zintrust/trace/ui';

registerTraceDashboard(router, {
  basePath: '/trace', // default
  middleware: ['admin'], // apply your auth middleware here
});
```

The dashboard SPA will be available at `GET /trace` (or your chosen `basePath`).

If you need custom storage wiring, keep using the low-level route registrar:

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

If you need a manual late bootstrap instead of plugin-driven activation, you can still import `@zintrust/trace/register` yourself, but that is the advanced path rather than the default project setup.

### 4. Optional stock-bootstrap auto-mount

If you want core to expose the trace dashboard without editing your route file, opt in explicitly:

```env
TRACE_ENABLED=true
TRACE_AUTO_MOUNT=true
TRACE_BASE_PATH=/trace
TRACE_MIDDLEWARE=auth,admin
```

When `TRACE_AUTO_MOUNT=true`, ZinTrust calls `registerTraceDashboard(...)` during bootstrap using `TRACE_BASE_PATH` and the optional comma-separated `TRACE_MIDDLEWARE` list. Keep this off if you want route ownership to stay fully in application code.

## CLI commands

When the optional package is installed, ZinTrust auto-registers these commands:

```bash
zin migrate:trace
zin trace:status
zin trace:prune --hours 24
zin trace:clear
```

`zin trace:status` reports the active connection, retention window, current entry counts, and the expected dashboard URL derived from your current env and route choices.

### Monitoring tags

The Monitoring page lets you save a short list of tags that you filter by often.

- Add tags like `auth`, `checkout`, `queue:emails`, or `nightly-sync` once, then click them later to jump straight to matching entries.
- Monitoring tags are just saved dashboard shortcuts. Removing a monitoring tag does not delete trace entries or strip tags from stored data.
- Use short, exact tag names. The dashboard filters entries by the exact tag value you click.

---

## Watchers

All 20 watchers are enabled by default when `TRACE_ENABLED=true`. Disable individual watchers via `TraceConfig.merge()` or environment-based overrides.

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
  TraceConfig,
  TraceStorage,
  TraceContext,
  HttpWatcher,
  QueryWatcher,
  ExceptionWatcher,
} from '@zintrust/trace';

const config = TraceConfig.merge({
  enabled: true,
  pruneAfterHours: 48,
  slowQueryThreshold: 200,
  watchers: {
    // disable specific watchers
    redis: false,
    view: false,
    request: {
      get: { exclude: ['report'] },
      post: { include: ['auth'] },
    },
    log: {
      exclude: ['healthcheck'],
    },
    exception: {
      include: ['trace'],
    },
  },
  redaction: {
    body: ['password', 'secret', 'token'],
  },
});

const db = useDatabase();
const storage = TraceStorage.resolveStorage(db);

HttpWatcher.register({ storage, config, db });
QueryWatcher.register({ storage, config, db });
ExceptionWatcher.register({ storage, config, db });
```

---

## Configuration reference

`TraceConfig.merge(overrides?)` accepts the following options:

| Option                                 | Type                                                | Default                            | Description                                                                    |
| -------------------------------------- | --------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------ |
| `enabled`                              | `boolean`                                           | `false`                            | Master switch — no watchers activate when `false`                              |
| `connection`                           | `string \| undefined`                               | `undefined`                        | Named DB connection for storing entries; uses `'default'` if omitted           |
| `observeConnection`                    | `string \| undefined`                               | `undefined`                        | Separate observed DB connection for query tracing when storage uses another DB |
| `pruneAfterHours`                      | `number`                                            | `24`                               | Entries older than this are pruned                                             |
| `slowQueryThreshold`                   | `number`                                            | `100`                              | Queries taking longer (ms) are flagged as slow                                 |
| `logMinLevel`                          | `'debug' \| 'info' \| 'warn' \| 'error' \| 'fatal'` | `'info'`                           | Minimum log severity captured                                                  |
| `captureCachePayloads`                 | `boolean`                                           | `false`                            | Include cache payload values in cache trace entries                            |
| `captureQueryBindings`                 | `boolean`                                           | `true`                             | Include SQL binding values in query trace entries                              |
| `contentDispatch.driver`               | `string \| undefined`                               | `undefined`                        | Registered queue driver used for async trace content offload                   |
| `contentDispatch.queueName`            | `string`                                            | `'trace-content'`                  | Queue name used for offloaded trace content writes                             |
| `contentDispatch.enqueueTimeoutMs`     | `number`                                            | `25`                               | Max enqueue wait before trace falls back to fail-open persistence              |
| `contentDispatch.worker.enabled`       | `boolean`                                           | `true`                             | Enables the internal trace queue drain worker                                  |
| `contentDispatch.worker.intervalMs`    | `number`                                            | `1000`                             | Poll interval for the internal trace queue drain worker                        |
| `contentDispatch.worker.maxDurationMs` | `number`                                            | `250`                              | Max runtime per drain pass before the worker yields                            |
| `contentDispatch.worker.concurrency`   | `number`                                            | `1`                                | Number of concurrent queue-drain loops for the internal trace worker           |
| `ignoreRoutes`                         | `string[]`                                          | `['/trace', '/health', '/ping']`   | Routes excluded from HTTP watcher                                              |
| `watchers`                             | `Record<string, boolean \| { include?, exclude? }>` | `{}`                               | Per-watcher enable/disable flags plus contains-based include/exclude filters   |
| `redaction.keys`                       | `string[]`                                          | common auth/card/session keys      | Extra sensitive keys redacted recursively before trace persistence             |
| `redaction.headers`                    | `string[]`                                          | `['authorization', 'cookie', ...]` | Request header names to redact                                                 |
| `redaction.body`                       | `string[]`                                          | `['password', 'token', ...]`       | Request body keys to redact                                                    |
| `redaction.query`                      | `string[]`                                          | `[]`                               | Query-string keys to redact                                                    |

Request watcher filters can also be scoped per method. Matching is contains-based against the stored trace content, so values like `report`, `auth`, or `trace` match any request or entry whose content includes those fragments.

```ts
const config = TraceConfig.merge({
  watchers: {
    request: {
      get: { exclude: ['report'] },
      post: { include: ['auth'] },
      patch: { include: ['profile'] },
    },
    log: { exclude: ['healthcheck'] },
    exception: { include: ['trace'] },
    cache: { include: ['session:'] },
  },
});
```

---

## Entry types

```ts
import { EntryType } from '@zintrust/trace';

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
import '@zintrust/trace/plugin';

// Advanced late bootstrap import for runtime hooks only
import '@zintrust/trace/register';

// Lightweight dashboard/UI-only entrypoint
import { registerTraceDashboard, registerTraceRoutes } from '@zintrust/trace/ui';

// Named exports
import {
  TraceConfig, // configuration factory + merge helper
  TraceStorage, // storage facade (read/write entries)
  TraceContext, // per-request context (userId, batchId)
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
} from '@zintrust/trace';
```

---

## Security considerations

- **Always** protect the dashboard with middleware (e.g. `middleware: ['admin']`). `@zintrust/trace/ui` exports `registerTraceDashboard(...)` and `registerTraceRoutes(...)`, and neither applies any authentication by default.
- Sensitive fields are redacted using the `redaction` config before they are stored. Review and extend the default `redaction.keys`, `redaction.headers`, `redaction.body`, and `redaction.query` lists to match your application's data model.
- Use a **dedicated database connection** (`TRACE_DB_CONNECTION`) in production so trace writes cannot impact your primary DB connection pool.
- Keep `TRACE_ENABLED=false` (or unset) in production unless actively investigating an issue.

---

## Peer dependencies

| Package          | Version   |
| ---------------- | --------- |
| `@zintrust/core` | `^0.4.41` |
