# Memory Leak and Bottleneck Analysis

## 1. Findings & Fixes

### Critical Memory Leak in `CsrfMiddleware` (FIXED)

- **Issue**: The `CsrfMiddleware.create()` factory created a new `setInterval` for token cleanup on every call. This timer captured the local `CsrfTokenManager` instance in a closure, preventing garbage collection.
- **Impact**: In environments where middleware is recreated (e.g., unit tests, hot-reloading configurations, or multi-tenant instance factories), this led to unbounded growth of zombie timers and `CsrfTokenManager` instances.
- **Fix Applied**:
  - Replaced the per-instance `setInterval` with a single module-level `globalCleanupTimer`.
  - Implemented `WeakRef`-based `managerRegistry`.
  - The global timer now iterates over weak references. If a middleware instance is garbage collected, its manager is also collected, and the registry entry is removed.
  - Added `unref()` to the global timer to ensure it doesn't block process exit.

### ORM Bottlenecks

- **N+1 Query Prevention**: The ORM (`QueryBuilder` and `Relationships`) correctly implements Eager Loading (`with()`) using `WHERE IN` clauses.
- **Recommendation**: Developers must ensure they use `.with('relationName')` when querying lists of models to avoid N+1 queries.

### Worker System

- **Optimization**: `WorkerStore` was recently optimized to support `updateMany`, reducing database round-trips during worker shutdown/startup sequences.

## 2. Static Analysis Audit

### Timer Usage

- `src/boot/bootstrap.ts`: Process signal listeners (Safe, singleton).
- `src/middleware/CsrfMiddleware.ts`: **Refactored to Safe Pattern**.
- `src/performance/Optimizer.ts`: Proper cleanup implemented.
- `src/orm/ConnectionManager.ts`: Proper cleanup implemented checks `state.cleanupInterval`.

### Async Patterns

- `Promise.all` is used extensively for parallel operations (e.g., `Optimizer.ts` loading modules, `DatabaseSeeder` running seeders). Parallel execution is good.
- No obvious "serial await" anti-patterns (e.g., `for ... await ...`) found in critical paths.

## 3. Runtime Recommendations

- **Connection Pool**: Monitor `ConnectionManager` stats. If `queued` waiters increase, increase pool size.
- **CSRF Tokens**: The current `CsrfTokenManager` uses an in-memory `Map`. For horizontal scaling (multiple Node processes/servers), consider replacing with a Redis-backed store to allow sharing tokens across instances (though Sticky Sessions can mitigate this).

### CSRF Redis Store (new)

- **What changed**: `CsrfTokenManager` now supports a Redis-backed store in addition to the in-memory Map. The implementation uses the project's `RedisKeys.getCsrfPrefix()` for key namespacing and stores token payloads with Redis TTLs so Redis expiry is relied upon for cleanup.
- **How to enable**: Set `CSRF_STORE=redis` (or `CSRF_DRIVER=redis`) in your environment. Optionally set `CSRF_REDIS_DB` to choose a Redis DB index; otherwise the queue/cache Redis DB settings are used. The manager will create/connect to Redis using the existing `REDIS_*` env settings (`REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`).
- **Key format**: Keys are created via `RedisKeys.createCsrfKey(sessionId)` (prefix from `RedisKeys.getCsrfPrefix()`), e.g. `{appPrefix}_csrf:{sessionId}`.
- **Behavioral notes**:
  - Tokens are stored as JSON blobs and saved with a TTL (PX) matching the configured token TTL (`TOKEN_TTL`).
  - Cleanup operations are effectively no-ops for Redis (expiry handled by Redis). The `cleanup()` method returns 0 for Redis but the API remains compatible.
  - Scanning/clear operations use `SCAN` with `MATCH {csrfPrefix}*` and `DEL` for explicit removal; avoid clearing large datasets in production without care.
- **Security & performance**:
  - Using Redis allows CSRF tokens to be shared across multiple app instances (horizontal scale) and avoids reliance on sticky sessions.
  - Monitor Redis keyspace and avoid storing unnecessarily long TTLs; token TTL defaults are driven by `TOKEN_TTL`.
- **Tests & templates**: Middleware and tests were updated to the async API (`generateToken`/`validateToken` now return Promises). Ensure any custom code calling the CSRF manager is updated to `await` the async calls.

## 4. Verification

- Unit tests for `CsrfMiddleware` passed.
- Static analysis of `spawn.ts` confirmed signal handling fixes (preventing CLI zombies).
