# Performance Profiling

Zintrust includes built-in profiling tools to help you identify and resolve performance bottlenecks.

## Request Profiling

The `RequestProfiler` tracks the execution time of every request, including time spent in middleware and controllers.

```typescript
// In your controller
const profile = req.profiler.start('expensive-operation');
await doSomething();
profile.end();
```

## Memory Profiling

Use the `MemoryProfiler` to track memory usage and identify potential leaks.

```typescript
import { MemoryProfiler } from '@performance/MemoryProfiler';

const stats = MemoryProfiler.getStats();
console.log(`Heap used: ${stats.heapUsed} MB`);
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
