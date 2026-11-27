/**
 * BackgroundTaskScheduler — runtime-agnostic background task scheduling.
 * Maps to ctx.waitUntil() in Cloudflare Workers, normal promises in Node.
 *
 * A Worker `ExecutionContext` is request-scoped. `setExecutionContext()` retains only a small
 * scheduler wrapper (never the context itself) in the module slot, and `reset()` drops it.
 * Prefer `forContext(ctx)` and pass the returned scheduler explicitly so no per-request object
 * is held by a module global; when `setExecutionContext()` is used, call `reset()` in a
 * `finally` block before the fetch handler returns.
 */

type ExecutionContext = {
  waitUntil(promise: Promise<unknown>): void;
};

type BackgroundTaskScheduler = {
  schedule(task: Promise<void>): void;
  isAvailable(): boolean;
};

let _scheduler: BackgroundTaskScheduler | undefined;

const isCloudflareRuntime = (): boolean => {
  const globalRef = typeof globalThis === 'undefined' ? undefined : globalThis;
  if (!globalRef) return false;

  // @ts-ignore - navigator is available in workers
  if (typeof navigator !== 'undefined' && navigator.userAgent === 'Cloudflare-Workers') {
    return true;
  }

  return (
    (globalRef as { caches?: unknown }).caches !== undefined ||
    typeof (globalRef as { WebSocketPair?: unknown }).WebSocketPair === 'function' ||
    (globalRef as { CF?: unknown }).CF !== undefined
  );
};

const createWorkerScheduler = (ctx: ExecutionContext): BackgroundTaskScheduler => {
  return Object.freeze({
    schedule(task: Promise<void>): void {
      ctx.waitUntil(task);
    },
    isAvailable(): boolean {
      return true;
    },
  });
};

const createNodeScheduler = (): BackgroundTaskScheduler => {
  return Object.freeze({
    schedule(task: Promise<void>): void {
      // In Node, fire-and-forget is acceptable since the process doesn't terminate
      // like Workers do. We still catch errors to prevent unhandled rejections.
      task.catch(() => {
        // Silently ignore background task errors to avoid noise
        // The individual watchers handle their own error logging
      });
    },
    isAvailable(): boolean {
      return true;
    },
  });
};

const createFallbackScheduler = (): BackgroundTaskScheduler => {
  return Object.freeze({
    schedule(task: Promise<void>): void {
      // Fallback: fire-and-forget with error suppression
      task.catch(() => undefined);
    },
    isAvailable(): boolean {
      return false;
    },
  });
};

export const BackgroundTaskScheduler = Object.freeze({
  /**
   * Create a scheduler bound to one request's execution context without storing it globally.
   * This is the preferred API for per-request use in Workers.
   */
  forContext(ctx: ExecutionContext): BackgroundTaskScheduler {
    return createWorkerScheduler(ctx);
  },

  /**
   * Set the Worker execution context for waitUntil support.
   * Call this from your Cloudflare Worker fetch handler and call `reset()` in `finally`:
   *   BackgroundTaskScheduler.setExecutionContext(ctx);
   *   try { ... } finally { BackgroundTaskScheduler.reset(); }
   */
  setExecutionContext(ctx: ExecutionContext): void {
    _scheduler = createWorkerScheduler(ctx);
  },

  /**
   * Get the current scheduler instance.
   */
  getScheduler(): BackgroundTaskScheduler {
    if (_scheduler) return _scheduler;

    if (isCloudflareRuntime()) {
      // We're in Workers but no context was set - use fallback
      _scheduler = createFallbackScheduler();
      return _scheduler;
    }

    // Node.js or other runtime
    _scheduler = createNodeScheduler();
    return _scheduler;
  },

  /**
   * Schedule a background task.
   * In Workers: uses ctx.waitUntil() if context is set
   * In Node: fire-and-forget with error suppression
   */
  schedule(task: Promise<void>): void {
    this.getScheduler().schedule(task);
  },

  /**
   * Check if a proper scheduler is available (i.e., Workers context is set).
   */
  isAvailable(): boolean {
    return this.getScheduler().isAvailable();
  },

  /**
   * Clear the request-scoped scheduler. Call at the end of each Worker fetch invocation.
   */
  reset(): void {
    _scheduler = undefined;
  },
});
