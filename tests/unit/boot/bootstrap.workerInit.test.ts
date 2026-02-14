import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('bootstrap useWorkerStarter path', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('initializes worker management system and logs info', async () => {
    const infoSpy = vi.fn();

    // Mock logger
    vi.doMock('@config/logger', () => ({
      Logger: { info: infoSpy, warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    }));

    // Ensure PluginAutoImports is harmless
    vi.doMock('@runtime/PluginAutoImports', () => ({
      PluginAutoImports: {
        tryImportProjectAutoImports: async () => ({ ok: false, reason: 'not-found' }),
      },
    }));

    // Mock Application to avoid heavy boot behavior
    vi.doMock('@boot/Application', () => ({
      Application: {
        create: () => ({
          boot: async () => {},
          getContainer: () => ({ get: () => ({ add: () => {} }) }),
          getRouter: () => ({}),
          getMiddlewareStack: () => ({}),
        }),
      },
    }));

    // Mock Server to avoid binding to ports
    vi.doMock('@boot/Server', () => ({
      Server: { create: () => ({ listen: async () => {}, close: async () => {} }) },
    }));

    // Mock scheduler to no-op
    vi.doMock('@/scheduler/ScheduleRunner', () => ({
      create: () => ({ register: () => {}, start: () => {}, stop: async () => {} }),
    }));
    vi.doMock('@/schedules', () => ({}));

    // Mock appConfig.detectRuntime to 'nodejs'
    vi.doMock('@config/app', () => ({
      appConfig: { detectRuntime: () => 'nodejs', dockerWorker: false, port: 0, host: '127.0.0.1' },
    }));

    const fakeWorkers = {
      WorkerInit: {
        initialize: vi.fn().mockResolvedValue(undefined),
        autoStartPersistedWorkers: vi.fn().mockResolvedValue(undefined),
      },
      WorkerShutdown: { shutdown: vi.fn().mockResolvedValue(undefined) },
    };

    vi.doMock('@runtime/WorkersModule', () => ({
      loadWorkersModule: async () => fakeWorkers,
    }));

    // Import bootstrap (it runs start on import)
    await import('@/boot/bootstrap');

    // ensure worker init initialize was called and log info emitted
    expect(fakeWorkers.WorkerInit.initialize).toHaveBeenCalled();
    expect(infoSpy).toHaveBeenCalledWith('Worker management system initialized');
  });
});
