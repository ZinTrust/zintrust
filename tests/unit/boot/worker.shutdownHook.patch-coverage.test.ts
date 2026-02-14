import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const createEnvEnabledModule = (
  enabled: boolean
): { Env: { getBool: ReturnType<typeof vi.fn> } } => ({
  Env: { getBool: vi.fn(() => enabled) },
});

const createAppConfigModule = (
  dockerWorker: boolean
): { appConfig: { dockerWorker: boolean } } => ({
  appConfig: { dockerWorker },
});

const createNoWorkersModule = (): { loadWorkersModule: ReturnType<typeof vi.fn> } => ({
  loadWorkersModule: vi.fn(),
});

const createWorkerModuleWithState = (params: {
  isShuttingDown: boolean;
  shutdown: () => Promise<void>;
}): { loadWorkersModule: ReturnType<typeof vi.fn> } => ({
  loadWorkersModule: vi.fn(async () => ({
    WorkerShutdown: {
      getShutdownState: () => ({ isShuttingDown: params.isShuttingDown, completedAt: null }),
      shutdown: params.shutdown,
    },
  })),
});

function captureAsyncHook(
  fn: () => Promise<void>,
  setHook: (hook: () => Promise<void>) => void
): void {
  setHook(fn);
}

describe('worker shutdown hook patch coverage', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns early when shutdown-on-exit is disabled', async () => {
    vi.doMock('@config/env', () => createEnvEnabledModule(false));
    vi.doMock('@/config/app', () => createAppConfigModule(false));
    vi.doMock('@runtime/WorkersModule', createNoWorkersModule);

    const add = vi.fn();
    const { registerWorkerShutdownHook } = await import('@registry/worker');
    await registerWorkerShutdownHook({ add } as any);
    expect(add).not.toHaveBeenCalled();
  });

  it('registers hook and calls WorkerShutdown.shutdown when not already shutting down', async () => {
    const shutdown = vi.fn(async () => undefined);

    vi.doMock('@config/env', () => createEnvEnabledModule(true));
    vi.doMock('@/config/app', () => createAppConfigModule(false));
    vi.doMock('@runtime/WorkersModule', () =>
      createWorkerModuleWithState({ isShuttingDown: false, shutdown })
    );

    let hook: (() => Promise<void>) | undefined;
    const setHook = (nextHook: () => Promise<void>): void => {
      hook = nextHook;
    };
    const add = vi.fn((fn: () => Promise<void>) => captureAsyncHook(fn, setHook));

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

    vi.doMock('@config/env', () => createEnvEnabledModule(true));
    vi.doMock('@/config/app', () => createAppConfigModule(false));
    vi.doMock('@runtime/WorkersModule', () =>
      createWorkerModuleWithState({ isShuttingDown: true, shutdown })
    );

    let hook: (() => Promise<void>) | undefined;
    const setHook = (nextHook: () => Promise<void>): void => {
      hook = nextHook;
    };
    const add = vi.fn((fn: () => Promise<void>) => captureAsyncHook(fn, setHook));

    const { registerWorkerShutdownHook } = await import('@registry/worker');
    await registerWorkerShutdownHook({ add } as any);
    await hook?.();

    expect(shutdown).not.toHaveBeenCalled();
  });
});
