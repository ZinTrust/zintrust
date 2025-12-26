# Performance Profiling

Zintrust includes built-in profiling tools to help you identify and resolve performance bottlenecks.

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
console.log(profiler.generateReport(report));
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
console.log(memProfiler.getReport());
```

## N+1 Query Detection

Zintrust automatically detects N+1 query patterns in development mode and logs a warning to the console.

```bash
[N1Detector] Warning: Potential N+1 query detected on table 'posts'.
```

## Real-time Dashboard

The `zin debug` command provides a real-time terminal dashboard showing:

- CPU and Memory usage.
- Active HTTP requests.
- Database query performance.
- Service health status.

```bash
zin debug
```
