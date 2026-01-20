import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/zintrust.plugins', () => ({}));

beforeEach(() => {
  vi.resetModules();
  // prevent real process.exit
  vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
});

afterEach(() => {
  vi.restoreAllMocks();
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
    await import('@boot/bootstrap');

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
  });

  it('exits process when start fails', async () => {
    const mockApp = {
      boot: vi.fn().mockRejectedValue(new Error('boot fail')),
      shutdown: vi.fn().mockResolvedValue(undefined),
      getContainer: vi.fn().mockReturnValue({ get: () => ({}) }),
    } as any;

    // Use global hook for hoisted mock factory
    vi.mock('@boot/Application', () => ({
      Application: { create: () => (globalThis as any).__mockApp },
    }));
    (globalThis as any).__mockApp = mockApp;

    vi.mock('@boot/Server', () => ({ Server: { create: () => ({ listen: vi.fn() }) } }));

    vi.mock('@config/logger', () => ({ Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

    // Importing bootstrap will run start and then cause process.exit(1)
    try {
      await import('@boot/bootstrap');
    } catch {
      // import may reject - ignore
    }

    expect(process.exit).toHaveBeenCalledWith(1);
  });
});
