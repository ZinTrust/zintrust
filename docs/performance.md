# Performance Optimization

Zintrust is built for speed, but there are several techniques you can use to further optimize your application.

## Memoization

Use `Memoize.create(...)` to cache the results of expensive function calls.

```typescript
import { Memoize } from '@performance/Optimizer';

const getGlobalStats = async (): Promise<unknown> => {
  // Expensive database aggregation
  return { ok: true };
};

export const getGlobalStatsMemoized = Memoize.create(getGlobalStats, { ttl: 60_000 });
```

## Lazy Loading

Zintrust supports lazy loading for heavy dependencies to improve startup time.

```typescript
import { LazyLoader } from '@performance/Optimizer';

const loader = LazyLoader.create();
const bcrypt = await loader.load('bcrypt');
```

## Parallel Execution

When performing multiple independent operations, use `ParallelGenerator` to run them concurrently.

```typescript
import { ParallelGenerator } from '@performance/Optimizer';

await ParallelGenerator.runAll([() => fetchUser(), () => fetchPosts(), () => fetchSettings()]);
```

## Database Optimization

- **Eager Loading**: Use `with()` to avoid N+1 queries.
- **Indexing**: Ensure your database columns are properly indexed.
- **Query Caching**: Cache frequent query results in Redis or memory.

## Production Mode

Always run Zintrust in production mode (`APP_ENV=production`) to disable debug logging and enable internal optimizations.
