import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules();
  // prevent real process.exit
  (globalThis as any).__EXIT_SPY__ = vi
    .spyOn(process, 'exit')
    .mockImplementation(() => undefined as never);
});

afterEach(() => {
  try {
    (globalThis as any).__EXIT_SPY__.mockRestore();
  } catch {
    // noop: best-effort cleanup (spy may not exist in some test paths)
  }
  try {
    delete (globalThis as any).__EXIT_SPY__;
  } catch {
    // noop: best-effort cleanup
  }
  delete process.env['SHUTDOWN_TIMEOUT'];
});

describe('Bootstrap additional branches', () => {
  it('with SHUTDOWN_TIMEOUT=0 uses immediate shutdown (no timeout) and exits 0', async () => {
    // Use real timers so shutdown resolves naturally
    vi.useRealTimers();

    process.env['SHUTDOWN_TIMEOUT'] = '0';

    // Mock logger to avoid noisy logs
    vi.doMock('@config/logger', () => ({
      Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    }));

    // Application with shutdown that resolves quickly
    vi.doMock('@boot/Application', () => ({
      Application: {
        create: () => ({
          boot: async () => {},
          shutdown: async () => {},
          getContainer: () => ({ get: () => ({}) }),
        }),
      },
    }));

    vi.doMock('@boot/Server', () => ({
      Server: { create: () => ({ listen: async () => {}, close: async () => {} }) },
    }));

    // Import bootstrap (it runs start on import)
    await import('@boot/bootstrap');

    // Trigger shutdown signal
    process.emit('SIGINT');

    // allow microtasks and a short tick for async shutdown to resolve
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 20));

    // Expect process.exit with code 0
    expect((globalThis as any).__EXIT_SPY__).toHaveBeenCalledWith(0);

    vi.useFakeTimers();
  });

  it('force-exit timer calls process.exit(0) when shutdown hangs/fails', async () => {
    vi.resetModules();
    vi.useFakeTimers();

    // Make the force-exit timer fire quickly
    process.env['SHUTDOWN_FORCE_EXIT_MS'] = '10';
    // Ensure withTimeout doesn't short-circuit before timer can fire
    process.env['SHUTDOWN_TIMEOUT'] = '1000';

    vi.doMock('@config/logger', () => ({
      Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    }));

    // Make shutdown fail quickly so gracefulShutdown returns and timer is not cleared
    vi.doMock('@boot/Application', () => ({
      Application: {
        create: () => ({
          boot: async () => {},
          shutdown: async () => {
            throw new Error('shutdown fail');
          },
          getContainer: () => ({ get: () => ({}) }),
        }),
      },
    }));

    vi.doMock('@boot/Server', () => ({
      Server: { create: () => ({ listen: async () => {}, close: async () => {} }) },
    }));

    await import('@boot/bootstrap');

    // Trigger shutdown; handler is async but process.emit does not await it
    process.emit('SIGTERM');

    // Let async shutdown start
    await Promise.resolve();

    // Advance timers to trigger the force-exit callback
    vi.advanceTimersByTime(10);

    expect((globalThis as any).__EXIT_SPY__).toHaveBeenCalledWith(0);

    process.removeAllListeners('SIGTERM');
    process.removeAllListeners('SIGINT');
    vi.useRealTimers();
    delete process.env['SHUTDOWN_FORCE_EXIT_MS'];
  });

  it('starts schedules when runtime is nodejs and registers shutdown hook', async () => {
    vi.resetModules();

    // prevent real process.exit
    (globalThis as any).__EXIT_SPY__ = vi
      .spyOn(process, 'exit')
      .mockImplementation(() => undefined as never);

    // Mock logger to avoid noisy logs and to assert warn isn't called
    const infoSpy = vi.fn();
    const warnSpy = vi.fn();
    vi.doMock('@config/logger', () => ({
      Logger: { info: infoSpy, warn: warnSpy, error: vi.fn() },
    }));

    // Mock application to provide shutdownManager
    const addSpy = vi.fn();
    vi.doMock('@boot/Application', () => ({
      Application: {
        create: () => ({
          boot: async () => {},
          shutdown: async () => {},
          getContainer: () => ({ get: () => ({ add: addSpy }) }),
        }),
      },
    }));

    // Mock server
    vi.doMock('@boot/Server', () => ({
      Server: { create: () => ({ listen: async () => {}, close: async () => {} }) },
    }));

    // Mock runtime detector to return nodejs
    vi.doMock('@/runtime/RuntimeDetector', () => ({
      RuntimeDetector: { detectRuntime: () => 'nodejs' },
    }));

    // Mock schedules module with a single fake schedule
    const fakeSchedule = { name: 's1' } as any;
    vi.doMock('@/schedules', () => ({ default: { s1: fakeSchedule } }));

    // Mock ScheduleRunner.create to provide register/start/stop
    const registerSpy = vi.fn();
    const startSpy = vi.fn();
    const stopSpy = vi.fn(async (_ms?: number) => {});
    vi.doMock('@/scheduler/ScheduleRunner', () => ({
      create: () => ({ register: registerSpy, start: startSpy, stop: stopSpy }),
    }));

    // Import bootstrap which triggers start
    await import('@boot/bootstrap');

    // allow microtasks to settle
    await Promise.resolve();

    // assert runner methods were called and shutdownManager.add registered
    expect(registerSpy).toHaveBeenCalled();
    expect(startSpy).toHaveBeenCalled();
    expect(addSpy).toHaveBeenCalled();

    // restore exit spy
    (globalThis as any).__EXIT_SPY__.mockRestore();
    delete (globalThis as any).__EXIT_SPY__;
  });

  it('does not register shutdown hook when shutdownManager.add is not a function', async () => {
    vi.resetModules();

    (globalThis as any).__EXIT_SPY__ = vi
      .spyOn(process, 'exit')
      .mockImplementation(() => undefined as never);

    const infoSpy = vi.fn();
    const warnSpy = vi.fn();
    vi.doMock('@config/logger', () => ({
      Logger: { info: infoSpy, warn: warnSpy, error: vi.fn() },
    }));

    // shutdownManager without add function
    vi.doMock('@boot/Application', () => ({
      Application: {
        create: () => ({
          boot: async () => {},
          shutdown: async () => {},
          getContainer: () => ({ get: () => ({}) }),
        }),
      },
    }));

    vi.doMock('@boot/Server', () => ({
      Server: { create: () => ({ listen: async () => {}, close: async () => {} }) },
    }));

    vi.doMock('@/runtime/RuntimeDetector', () => ({
      RuntimeDetector: { detectRuntime: () => 'nodejs' },
    }));

    const fakeSchedule = { name: 's1' } as any;
    vi.doMock('@/schedules', () => ({ default: { s1: fakeSchedule } }));

    const registerSpy = vi.fn();
    const startSpy = vi.fn();
    const stopSpy = vi.fn(async (_ms?: number) => {});
    vi.doMock('@/scheduler/ScheduleRunner', () => ({
      create: () => ({ register: registerSpy, start: startSpy, stop: stopSpy }),
    }));

    await import('@boot/bootstrap');

    await Promise.resolve();

    expect(registerSpy).toHaveBeenCalled();
    expect(startSpy).toHaveBeenCalled();

    (globalThis as any).__EXIT_SPY__.mockRestore();
    delete (globalThis as any).__EXIT_SPY__;
  });

  it('exits with code 1 when start throws', async () => {
    vi.resetModules();

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

    const errorSpy = vi.fn();
    vi.doMock('@config/logger', () => ({
      Logger: { info: vi.fn(), warn: vi.fn(), error: errorSpy },
    }));

    vi.doMock('@boot/Application', () => ({
      Application: {
        create: () => ({
          boot: async () => {
            throw new Error('boot fail');
          },
        }),
      },
    }));

    // prevent server from being used
    vi.doMock('@boot/Server', () => ({ Server: { create: () => ({ listen: async () => {} }) } }));

    await import('@boot/bootstrap');

    await Promise.resolve();

    expect(errorSpy).toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(1);

    exitSpy.mockRestore();
  });
});
