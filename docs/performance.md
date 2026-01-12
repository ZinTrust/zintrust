# Performance Optimization

ZinTrust is built for speed, but there are several techniques you can use to further optimize your application.

## Memoization

Use `Memoize.create(...)` to cache the results of expensive function calls.

```typescript
import { Memoize } from '@zintrust/core';

const getGlobalStats = async (): Promise<unknown> => {
  // Expensive database aggregation
  return { ok: true };
};

export const getGlobalStatsMemoized = Memoize.create(getGlobalStats, { ttl: 60_000 });
```

## Lazy Loading

ZinTrust supports lazy loading for heavy dependencies to improve startup time.

```typescript
import { LazyLoader } from '@zintrust/core';

const loader = LazyLoader.create();
const bcrypt = await loader.load('bcrypt');
```

## Parallel Execution

When performing multiple independent operations, use `ParallelGenerator` to run them concurrently.

```typescript
import { ParallelGenerator } from '@zintrust/core';

await ParallelGenerator.runAll([() => fetchUser(), () => fetchPosts(), () => fetchSettings()]);
```

## Database Optimization

- **Eager Loading**: Use `with()` to avoid N+1 queries.
- **Indexing**: Ensure your database columns are properly indexed.
- **Query Caching**: Cache frequent query results in Redis or memory.

# Performance Optimization

ZinTrust is built for speed, but there are several techniques you can use to further optimize your application.

This page focuses on the performance utilities that are part of the public `@zintrust/core` API.

## Memoization

Use `Memoize.create(...)` to cache the results of expensive function calls.

```typescript
import { Memoize } from '@zintrust/core';

const getGlobalStats = async (): Promise<unknown> => {
  // Expensive database aggregation
  return { ok: true };
};

export const getGlobalStatsMemoized = Memoize.create(getGlobalStats, {
  ttl: 60_000,
});
```

Notes:

- Memoization is in-memory per process (not shared across instances).
- By default the cache key is derived from `JSON.stringify(args)`; prefer a custom `keyGenerator` when args are large or non-serializable.

## Lazy Loading

Use `LazyLoader` to defer loading optional or heavy dependencies until they’re needed.

```typescript
import { LazyLoader } from '@zintrust/core';

const loader = LazyLoader.create();
const bcrypt = await loader.load<typeof import('bcrypt')>('bcrypt');
```

Notes:

- `LazyLoader` uses dynamic `import()` and caches the module namespace object.
- This is most useful for optional dependencies and rarely-executed code paths.

## Parallel Execution

When performing multiple independent operations, use `ParallelGenerator` to run them concurrently.

```typescript
import { ParallelGenerator } from '@zintrust/core';

await ParallelGenerator.runAll([() => fetchUser(), () => fetchPosts(), () => fetchSettings()]);
```

If you want to bound concurrency, use batching:

```typescript
import { ParallelGenerator } from '@zintrust/core';

await ParallelGenerator.runBatch(
  [() => fetchUser(), () => fetchPosts(), () => fetchSettings(), () => fetchTeams()],
  2
);
```

Notes:

- `runBatch()` executes batches sequentially, and each batch runs in parallel.

## PerformanceOptimizer

`PerformanceOptimizer` wraps caching, lazy-loading, and parallel execution behind a single interface.

```typescript
import { PerformanceOptimizer } from '@zintrust/core';

const optimizer = PerformanceOptimizer.create();

const result = await optimizer.generateWithCache('stats', { tenantId: 't_123' }, async () => ({
  ok: true,
}));

await optimizer.preloadModules(['bcrypt']);

const parallelResults = await optimizer.generateInParallel(
  [() => Promise.resolve(1), () => Promise.resolve(2)],
  2
);

void result;
void parallelResults;
```

Notes:

- The optimizer’s generation cache persists to disk by default under `.gen-cache/` in the current working directory.

## Database Optimization

- **Eager Loading**: Use `with()` to avoid N+1 queries.
- **Indexing**: Ensure your database columns are properly indexed.
- **Query Caching**: Cache frequent query results in Redis or memory.

## Production Mode

Always run ZinTrust in production mode (`APP_ENV=production`) to disable debug logging and enable production optimizations.
