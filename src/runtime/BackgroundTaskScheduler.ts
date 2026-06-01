/**
 * BackgroundTaskScheduler — runtime-agnostic background task scheduling.
 * Maps to ctx.waitUntil() in Cloudflare Workers, normal promises in Node.
 */

type ExecutionContext = {
  waitUntil(promise: Promise<unknown>): void;
};

type BackgroundTaskScheduler = {
  schedule(task: Promise<void>): void;
  isAvailable(): boolean;
};

let _executionContext: ExecutionContext | undefined;
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
   * Set the Worker execution context for waitUntil support.
   * Call this from your Cloudflare Worker fetch handler:
   *   BackgroundTaskScheduler.setExecutionContext(ctx);
   */
  setExecutionContext(ctx: ExecutionContext): void {
    _executionContext = ctx;
    _scheduler = createWorkerScheduler(ctx);
  },

  /**
   * Get the current scheduler instance.
   */
  getScheduler(): BackgroundTaskScheduler {
    if (_scheduler) return _scheduler;

    if (_executionContext) {
      _scheduler = createWorkerScheduler(_executionContext);
      return _scheduler;
    }

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
   * Reset the scheduler (useful for testing).
   */
  reset(): void {
    _executionContext = undefined;
    _scheduler = undefined;
  },
});
