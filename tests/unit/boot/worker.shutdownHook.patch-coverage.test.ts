import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('worker shutdown hook patch coverage', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns early when shutdown-on-exit is disabled', async () => {
    vi.doMock('@config/env', () => ({
      Env: { getBool: vi.fn(() => false) },
    }));
    vi.doMock('@/config/app', () => ({ appConfig: { dockerWorker: false } }));
    vi.doMock('@runtime/WorkersModule', () => ({ loadWorkersModule: vi.fn() }));

    const add = vi.fn();
    const { registerWorkerShutdownHook } = await import('@registry/worker');
    await registerWorkerShutdownHook({ add } as any);
    expect(add).not.toHaveBeenCalled();
  });

  it('registers hook and calls WorkerShutdown.shutdown when not already shutting down', async () => {
    const shutdown = vi.fn(async () => undefined);

    vi.doMock('@config/env', () => ({
      Env: { getBool: vi.fn(() => true) },
    }));
    vi.doMock('@/config/app', () => ({ appConfig: { dockerWorker: false } }));
    vi.doMock('@runtime/WorkersModule', () => ({
      loadWorkersModule: vi.fn(async () => ({
        WorkerShutdown: {
          getShutdownState: () => ({ isShuttingDown: false, completedAt: null }),
          shutdown,
        },
      })),
    }));

    let hook: (() => Promise<void>) | undefined;
    const add = vi.fn((fn: () => Promise<void>) => {
      hook = fn;
    });

    const { registerWorkerShutdownHook } = await import('@registry/worker');
    await registerWorkerShutdownHook({ add } as any);
    await hook?.();

    expect(shutdown).toHaveBeenCalledWith({
      signal: 'APP_SHUTDOWN',
      timeout: 5000,
      forceExit: false,
    });
  });

  it('does not shutdown when already shutting down', async () => {
    const shutdown = vi.fn(async () => undefined);

    vi.doMock('@config/env', () => ({
      Env: { getBool: vi.fn(() => true) },
    }));
    vi.doMock('@/config/app', () => ({ appConfig: { dockerWorker: false } }));
    vi.doMock('@runtime/WorkersModule', () => ({
      loadWorkersModule: vi.fn(async () => ({
        WorkerShutdown: {
          isShuttingDown: () => true,
          getShutdownState: () => ({ isShuttingDown: true, completedAt: null }),
          shutdown,
        },
      })),
    }));

    let hook: (() => Promise<void>) | undefined;
    const add = vi.fn((fn: () => Promise<void>) => {
      hook = fn;
    });

    const { registerWorkerShutdownHook } = await import('@registry/worker');
    await registerWorkerShutdownHook({ add } as any);
    await hook?.();

    expect(shutdown).not.toHaveBeenCalled();
  });
});
