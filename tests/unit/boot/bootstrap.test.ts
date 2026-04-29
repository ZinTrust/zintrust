import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/zintrust.plugins', () => ({}));

const mockRuntimeDependencies = (): void => {
  vi.doMock('@config/env', () => ({
    Env: {
      getInt: () => 0,
      get: () => 'localhost',
      getBool: (_key: string, defaultVal?: boolean) => defaultVal ?? false,
      getFloat: (_key: string, defaultVal?: number) => defaultVal ?? 0,
    },
  }));
  vi.doMock('@config/app', () => ({
    appConfig: {
      worker: false,
      dockerWorker: false,
      cloudflareWorker: false,
      detectRuntime: () => 'nodejs',
    },
  }));
  vi.doMock('@config/cloudflare', () => ({
    Cloudflare: { getWorkersEnv: () => null },
  }));
  vi.doMock('@config/workers', () => ({
    shutdownRedisConnections: vi.fn(async () => undefined),
  }));
  vi.doMock('@runtime/ProjectRuntime', () => ({
    ProjectRuntime: { tryLoadHooks: vi.fn(async () => undefined) },
  }));
  vi.doMock('@runtime/StartupErrorLogging', () => ({
    StartupErrorLogging: { logDetails: vi.fn() },
  }));
  vi.doMock('@runtime/WorkerProjectAutoImports', () => ({
    WorkerProjectAutoImports: {
      load: vi.fn(async () => undefined),
    },
  }));
  vi.doMock('@runtime/WorkersModule', () => ({
    loadWorkersModule: vi.fn(async () => ({
      WorkerInit: {
        initialize: vi.fn(async () => undefined),
        autoStartPersistedWorkers: vi.fn(async () => undefined),
      },
      WorkerShutdown: {
        shutdown: vi.fn(async () => undefined),
      },
    })),
  }));
};

const importBootstrap = async () => {
  const bootstrapModule = await import('@boot/bootstrap');
  await bootstrapModule.bootstrapReady;
  return bootstrapModule;
};

beforeEach(() => {
  vi.resetModules();
  // prevent real process.exit
  vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
});

afterEach(() => {
  vi.doUnmock('@boot/Application');
  vi.doUnmock('@boot/Server');
  vi.doUnmock('@config/app');
  vi.doUnmock('@config/logger');
  vi.doUnmock('@/scheduler/ScheduleRunner');
  vi.doUnmock('@/schedules');
  vi.restoreAllMocks();
  vi.resetModules();
  process.removeAllListeners('SIGTERM');
  process.removeAllListeners('SIGINT');
  process.removeAllListeners('SIGUSR2');
});

describe('Bootstrap start flow', () => {
  it.skip('starts server and schedules when runtime is nodejs', async () => {
    // Mock Application
    const mockApp = {
      boot: vi.fn().mockResolvedValue(undefined),
      shutdown: vi.fn().mockResolvedValue(undefined),
      getContainer: vi.fn().mockReturnValue({ get: () => ({ add: vi.fn() }) }),
    } as any;

    const mockServer = {
      listen: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    } as any;

    // Use global hook so hoisted mock factory can reference the current mock instance
    vi.mock('@boot/Application', () => ({
      Application: { create: () => (globalThis as any).__mockApp },
    }));

    // Expose the concrete mocks on global so the hoisted factory will return them
    (globalThis as any).__mockApp = mockApp;
    (globalThis as any).__mockServer = mockServer;

    // Sanity check mocked Application module now returns the mock instance
    const AppMod = await import('@boot/Application');
    expect(AppMod.Application.create()).toBe(mockApp);

    vi.mock('@boot/Server', () => ({ Server: { create: () => (globalThis as any).__mockServer } }));

    // Sanity check mocked Server module
    const ServerMod = await import('@boot/Server');
    expect(typeof ServerMod.Server.create(mockApp, 3000, 'localhost').listen).toBe('function');

    // runtime detection
    vi.mock('@config/app', () => ({
      appConfig: { detectRuntime: () => 'nodejs' },
    }));

    // schedule runner and schedules
    const runner = {
      register: vi.fn(),
      start: vi.fn(),
      stop: vi.fn().mockResolvedValue(undefined),
    };
    vi.mock('@/scheduler/ScheduleRunner', () => ({ create: () => runner }));
    vi.mock('@/schedules', () => ({ sch1: {} }));

    // stub logger
    vi.mock('@config/logger', () => ({ Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

    // import bootstrap module which runs start on import
    // vitest's vi.resetModules() in beforeEach ensures a fresh module instance
    const bootstrapModule = await import('@boot/bootstrap');
    await bootstrapModule.bootstrapReady;

    expect(mockApp.boot).toHaveBeenCalled();
    expect(mockServer.listen).toHaveBeenCalled();
    expect(runner.start).toHaveBeenCalled();
    expect(runner.register).toHaveBeenCalled();

    // ensure process.exit not called
    expect(process.exit).not.toHaveBeenCalled();

    // Trigger shutdown to exercise gracefulShutdown and ensure it cleans up
    process.emit('SIGTERM');

    // wait for shutdown tasks to settle
    await new Promise((r) => setTimeout(r, 50));

    expect(mockServer.close).toHaveBeenCalled();
    expect(mockApp.shutdown).toHaveBeenCalled();
    expect(process.exit).toHaveBeenCalledWith(0);

    // cleanup attached signal handlers to avoid flakiness in other tests
    process.removeAllListeners('SIGTERM');
    process.removeAllListeners('SIGINT');
    process.removeAllListeners('SIGUSR2');
  });

  it('exits process when start fails', async () => {
    const mockApp = {
      boot: vi.fn().mockRejectedValue(new Error('boot fail')),
      shutdown: vi.fn().mockResolvedValue(undefined),
      getContainer: vi.fn().mockReturnValue({ get: () => ({}) }),
    } as any;

    mockRuntimeDependencies();

    // Use global hook for hoisted mock factory
    vi.doMock('@boot/Application', () => ({
      Application: { create: () => (globalThis as any).__mockApp },
    }));
    (globalThis as any).__mockApp = mockApp;

    vi.doMock('@boot/Server', () => ({ Server: { create: () => ({ listen: vi.fn() }) } }));

    vi.doMock('@config/logger', () => ({
      Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    }));

    // Importing bootstrap will run start and then cause process.exit(1)
    await importBootstrap();

    expect(process.exit).toHaveBeenCalledWith(1);
  });

  it('still exits when logger.error throws during bootstrap failure handling', async () => {
    const mockApp = {
      boot: vi.fn().mockRejectedValue(new Error('boot fail')),
      shutdown: vi.fn().mockResolvedValue(undefined),
      getContainer: vi.fn().mockReturnValue({ get: () => ({}) }),
    } as any;

    mockRuntimeDependencies();

    vi.doMock('@boot/Application', () => ({
      Application: { create: () => (globalThis as any).__mockApp },
    }));
    (globalThis as any).__mockApp = mockApp;

    vi.doMock('@boot/Server', () => ({ Server: { create: () => ({ listen: vi.fn() }) } }));

    const loggerError = vi.fn(() => {
      throw new Error('logger failed');
    });
    vi.doMock('@config/logger', () => ({
      Logger: { info: vi.fn(), warn: vi.fn(), error: loggerError, debug: vi.fn() },
    }));

    await importBootstrap();

    expect(loggerError).toHaveBeenCalledWith('Failed to bootstrap application:', expect.any(Error));
    expect(process.exit).toHaveBeenCalledWith(1);
  });

  it('continues graceful shutdown when worker and redis cleanup fail', async () => {
    const loggerWarn = vi.fn();
    const mockApp = {
      boot: vi.fn().mockResolvedValue(undefined),
      shutdown: vi.fn().mockResolvedValue(undefined),
      getContainer: vi.fn().mockReturnValue({ get: () => ({}) }),
    } as any;

    const mockServer = {
      listen: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    } as any;

    vi.doMock('@config/env', () => ({
      Env: {
        getInt: (_key: string, defaultVal?: number) => defaultVal ?? 0,
        get: () => 'localhost',
        getBool: (_key: string, defaultVal?: boolean) => defaultVal ?? false,
        getFloat: (_key: string, defaultVal?: number) => defaultVal ?? 0,
      },
    }));
    vi.doMock('@config/app', () => ({
      appConfig: {
        worker: true,
        dockerWorker: false,
        cloudflareWorker: false,
        detectRuntime: () => 'nodejs',
      },
    }));
    vi.doMock('@config/cloudflare', () => ({
      Cloudflare: { getWorkersEnv: () => null },
    }));
    vi.doMock('@config/workers', () => ({
      shutdownRedisConnections: vi.fn(async () =>
        Promise.reject(new Error('redis cleanup failed'))
      ),
    }));
    vi.doMock('@runtime/ProjectRuntime', () => ({
      ProjectRuntime: { tryLoadHooks: vi.fn(async () => undefined) },
    }));
    vi.doMock('@runtime/StartupErrorLogging', () => ({
      StartupErrorLogging: { logDetails: vi.fn() },
    }));
    vi.doMock('@runtime/WorkerProjectAutoImports', () => ({
      WorkerProjectAutoImports: { load: vi.fn(async () => undefined) },
    }));
    vi.doMock('@runtime/WorkersModule', () => ({
      loadWorkersModule: vi.fn(async () => ({
        WorkerInit: {
          initialize: vi.fn(async () => undefined),
          autoStartPersistedWorkers: vi.fn(async () => undefined),
        },
        WorkerShutdown: {
          shutdown: vi.fn(async () => Promise.reject(new Error('worker cleanup failed'))),
        },
      })),
    }));
    vi.doMock('@boot/Application', () => ({
      Application: { create: () => (globalThis as any).__mockApp },
    }));
    vi.doMock('@boot/Server', () => ({
      Server: { create: () => (globalThis as any).__mockServer },
    }));
    vi.doMock('@config/logger', () => ({
      Logger: { info: vi.fn(), warn: loggerWarn, error: vi.fn(), debug: vi.fn() },
    }));

    (globalThis as any).__mockApp = mockApp;
    (globalThis as any).__mockServer = mockServer;

    await importBootstrap();

    process.emit('SIGTERM');
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(loggerWarn).toHaveBeenCalledWith(
      'Worker shutdown failed (continuing with app shutdown)',
      expect.any(Error)
    );
    expect(loggerWarn).toHaveBeenCalledWith(
      'Redis connection shutdown failed (continuing with app shutdown)',
      expect.any(Error)
    );
    expect(process.exit).toHaveBeenCalledWith(0);
  });
});
