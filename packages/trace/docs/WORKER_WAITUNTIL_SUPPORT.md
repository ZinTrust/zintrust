# Cloudflare Workers waitUntil Support for Trace Persistence

## Overview

The ZinTrust trace package now supports Cloudflare Workers' `ctx.waitUntil()` lifecycle for reliable trace persistence. This ensures that trace writes complete even after the HTTP response is sent, preventing data loss in Workers environments.

## Problem

In Cloudflare Workers, async tasks that are fire-and-forget (not awaited) may be terminated when the Worker finishes processing the request. The previous trace implementation used:

```typescript
storage.writeEntry(entry).catch(() => undefined); // fire-and-forget
```

This caused trace writes to be lost in Workers environments because the Worker could terminate before the write completed.

## Solution

### Background Task Scheduler

A new `BackgroundTaskScheduler` runtime abstraction maps to the appropriate background task mechanism:

- **Cloudflare Workers**: Uses `ctx.waitUntil()` when execution context is provided
- **Node.js**: Uses fire-and-forget with error suppression (process doesn't terminate like Workers)
- **Fallback**: Gracefully degrades if no context is set

### API

```typescript
import { BackgroundTaskScheduler } from '@zintrust/trace';

// In your Cloudflare Worker fetch handler:
export default {
  async fetch(request, env, ctx) {
    // Set the execution context for trace persistence
    BackgroundTaskScheduler.setExecutionContext(ctx);

    // ... your application code

    return new Response('OK');
  }
};
```

### Integration with Trace Watchers

All trace watchers now receive a `scheduleBackgroundTask` callback in their configuration:

```typescript
interface ITraceWatcherConfig {
  storage: ITraceStorage;
  config: ITraceConfig;
  db?: IDatabase;
  registerMiddleware?: (...);
  scheduleBackgroundTask?: (task: Promise<void>) => void; // NEW
}
```

Watchers use this callback to schedule trace writes:

```typescript
const writePromise = storage.writeEntry(entry).catch((error) => {
  Logger.warn('[trace] writeEntry failed', { error });
});

if (scheduleBackgroundTask) {
  scheduleBackgroundTask(writePromise); // Uses waitUntil in Workers
} else {
  writePromise.catch(() => undefined); // Fallback for backward compatibility
}
```

## Usage

### For Cloudflare Workers

1. Set the execution context in your Worker fetch handler:

```typescript
import { BackgroundTaskScheduler } from '@zintrust/trace';

export default {
  async fetch(request, env, ctx) {
    BackgroundTaskScheduler.setExecutionContext(ctx);

    // Initialize ZinTrust app
    const app = createApp();
    await app.boot();

    // Handle request
    return app.handle(request);
  }
};
```

2. Enable trace as usual:

```typescript
// In your app config or environment
TRACE_ENABLED=true
TRACE_PROXY=true  // if using proxy storage
```

### For Node.js

No changes required. The scheduler automatically detects the runtime and uses appropriate behavior.

## Migration Guide

### Before (broken in Workers)

```typescript
// Trace writes could be lost in Workers
storage.writeEntry(entry).catch(() => undefined);
```

### After (reliable in Workers)

```typescript
// Trace writes are scheduled via waitUntil in Workers
const writePromise = storage.writeEntry(entry).catch((error) => {
  Logger.warn('[trace] writeEntry failed', { error });
});

if (scheduleBackgroundTask) {
  scheduleBackgroundTask(writePromise);
}
```

### For Existing Workers

Add this to your Worker fetch handler:

```typescript
import { BackgroundTaskScheduler } from '@zintrust/trace';

export default {
  async fetch(request, env, ctx) {
    BackgroundTaskScheduler.setExecutionContext(ctx);

    // ... existing code
  }
};
```

## Backward Compatibility

- **Fully backward compatible**: Existing code continues to work without changes
- **Graceful degradation**: If `setExecutionContext` is not called, the scheduler uses fire-and-forget with error suppression
- **No breaking changes**: The `scheduleBackgroundTask` parameter is optional in `ITraceWatcherConfig`

## Implementation Details

### Affected Watchers

The following watchers have been updated to use the background task scheduler:

- `HttpWatcher` - HTTP request/response traces
- `QueryWatcher` - Database query traces  
- `LogWatcher` - Logger output traces
- `ExceptionWatcher` - Exception traces
- `HttpClientWatcher` - HTTP client request traces

Other watchers continue to use fire-and-forget for now but can be updated similarly if needed.

### Testing

Comprehensive tests have been added:

- `BackgroundTaskScheduler.test.ts` - Tests scheduler behavior in different runtimes
- All existing trace tests continue to pass
- Tests verify both Workers and Node.js behavior

## Performance Impact

**Zero performance impact on response time:**

- `ctx.waitUntil()` does not block the response
- Response is sent immediately, same as before
- Trace writes complete in the background after response
- Only difference is reliability (writes actually complete)

## Troubleshooting

### Traces still not appearing in Workers

1. Ensure `BackgroundTaskScheduler.setExecutionContext(ctx)` is called in your fetch handler
2. Verify trace is enabled: `TRACE_ENABLED=true`
3. Check trace configuration (proxy vs local storage)
4. Verify Worker logs for any trace-related errors

### Fallback behavior

If you see this in logs, the scheduler is using fallback mode:

```
[trace] Background task scheduler not available, using fire-and-forget
```

This happens when:
- Running in Workers but `setExecutionContext` was not called
- Running in an unknown runtime

The trace will still work, but may be unreliable in Workers.

## Future Enhancements

Potential improvements:

1. Auto-detect Workers execution context from global scope
2. Add metrics for background task completion rates
3. Support for other serverless platforms (Vercel, AWS Lambda)
4. Configurable timeout for background tasks
