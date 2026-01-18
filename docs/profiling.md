# Performance Profiling

ZinTrust includes built-in profiling tools to help you identify and resolve performance bottlenecks.

## Request Profiling

The `RequestProfiler` tracks the execution time of every request, including time spent in middleware and controllers.

```typescript
import { RequestProfiler } from '@zintrust/core';

// Create a profiler instance
const profiler = RequestProfiler.create();

// Capture a request or operation
const report = await profiler.captureRequest(async () => {
  await doSomethingExpensive();
});

// Generate and log the report
Logger.info(profiler.generateReport(report));
```

## Memory Profiling

Use the `MemoryProfiler` to track memory usage and identify potential leaks.

```typescript
import { MemoryProfiler } from '@zintrust/core';

const memProfiler = MemoryProfiler.create();

// Start tracking (forces GC if available)
memProfiler.start();

// Run your logic
await heavyProcessing();

// End tracking and get report
memProfiler.end();
Logger.info(memProfiler.getReport());
```

## N+1 Query Detection

ZinTrust automatically detects N+1 query patterns in development mode and logs a warning to the console.

```bash
[N1Detector] Warning: Potential N+1 query detected on table 'posts'.
```

## Real-time Dashboard

The `zin debug` command provides a real-time terminal dashboard showing:

- CPU and Memory usage.

# Performance Profiling

ZinTrust includes profiling utilities you can use to identify and resolve performance bottlenecks.

## Request Profiling

`RequestProfiler` combines:

- timing (`duration`)
- memory delta (via `MemoryProfiler`)
- N+1 detection (via `N1Detector`, based on query logs you provide)

```typescript
import { RequestProfiler } from '@zintrust/core';

const profiler = RequestProfiler.create();

const report = await profiler.captureRequest(async () => {
  await doSomethingExpensive();
});

Logger.info(profiler.generateReport(report));
```

## Memory Profiling

Use `MemoryProfiler` for a before/after snapshot and delta.

```typescript
import { MemoryProfiler } from '@zintrust/core';

const memProfiler = MemoryProfiler.create();

memProfiler.start();
await heavyProcessing();
memProfiler.end();

Logger.info(memProfiler.getReport());
```

Notes:

- `MemoryProfiler.start()` will call `globalThis.gc()` if it exists. To enable that in Node.js, run with `node --expose-gc`.

## Query Logging (Required for N+1 Detection)

ZinTrust does not automatically intercept ORM/database queries for profiling.

To get N+1 detection (and accurate query counts), you must log queries yourself via `QueryLogger`:

```typescript
import { QueryLogger } from '@zintrust/core';

const queryLogger = QueryLogger.getInstance();

async function queryWithLogging\<T>(sql: string, params: unknown[], run: () => Promise\<T>) {
  const start = Date.now();
  const result = await run();
  const duration = Date.now() - start;

  queryLogger.logQuery(sql, params, duration);
  return result;
}
```

`RequestProfiler.captureRequest()` sets the logger context to `profiling` for the duration of the capture.
If your query logging uses the same `QueryLogger` instance, calls to `logQuery()` will automatically be associated with that context.

## N+1 Detection

`N1Detector` is a utility that groups identical SQL statements and flags those executed 5+ times.
`RequestProfiler` runs it against the captured query log.

```typescript
import { N1Detector } from '@zintrust/core';

const detector = N1Detector.create();
const patterns = detector.detect([]);
void patterns;
```

## Real-time Dashboard (CLI)

ZinTrust includes a terminal dashboard via the `debug` CLI command:

```bash
zin debug
```

Current behavior:

- System stats (memory + CPU load) are real.
- Request/query counters are currently mock/demo values (not automatically wired to your app runtime).
