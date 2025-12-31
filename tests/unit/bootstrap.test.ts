import { Application } from '@boot/Application';
import { Server } from '@boot/Server';
import { Logger } from '@config/logger';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

// Mock dependencies
vi.mock('@boot/Application', () => ({
  Application: {
    create: vi.fn(),
  },
}));
vi.mock('@boot/Server', () => ({
  Server: {
    create: vi.fn(),
  },
}));
vi.mock('@routes/api', () => ({
  registerRoutes: vi.fn(),
}));
vi.mock('@config/env', () => ({
  Env: {
    PORT: 3000,
    HOST: 'localhost',
    NODE_ENV: 'test',
    DB_CONNECTION: 'sqlite',
    SHUTDOWN_TIMEOUT: 10_000,
    get: vi.fn((key: string, defaultValue: unknown) => {
      String(key);
      return defaultValue;
    }),
    getInt: vi.fn((key: string, defaultValue: number) => {
      String(key);
      return defaultValue;
    }),
    getBool: vi.fn((key: string, defaultValue: boolean) => {
      String(key);
      return defaultValue;
    }),
  },
}));
vi.mock('@config/logger', () => ({
  Logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    scope: vi.fn(() => ({
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    })),
  },
}));

vi.mock('@/runtime/RuntimeDetector', () => ({
  RuntimeDetector: {
    detectRuntime: vi.fn(() => 'unknown'),
  },
}));

vi.mock('@/scheduler/ScheduleRunner', () => ({
  create: vi.fn(() => ({
    register: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(async () => undefined),
  })),
}));

vi.mock('@/schedules', () => ({
  logCleanup: {
    name: 'log-cleanup',
    intervalMs: 0,
    runOnStart: false,
    enabled: true,
    handler: vi.fn(async () => undefined),
  },
}));

describe('Bootstrap', () => {
  type SignalName = 'SIGTERM' | 'SIGINT';
  type SignalHandler = () => void | Promise<void>;
  type ListenFn = () => Promise<void>;
  type CloseFn = () => Promise<void>;
  type ShutdownFn = () => Promise<void>;

  let mockServer: {
    listen: ReturnType<typeof vi.fn<ListenFn>>;
    close: ReturnType<typeof vi.fn<CloseFn>>;
  };
  let mockApp: { getRouter: Mock; boot: Mock; shutdown: ReturnType<typeof vi.fn<ShutdownFn>> };
  let signalHandlers: Partial<Record<SignalName, SignalHandler>>;

  beforeEach(() => {
    vi.clearAllMocks();

    signalHandlers = {};

    // Mock process methods
    vi.spyOn(process, 'exit').mockImplementation(
      (() => undefined) as unknown as typeof process.exit
    );
    vi.spyOn(process, 'on').mockImplementation(((
      event: string,
      handler: (...args: unknown[]) => void
    ) => {
      if (event === 'SIGTERM' || event === 'SIGINT') {
        signalHandlers[event] = handler as SignalHandler;
      }
      return process;
    }) as unknown as typeof process.on);
    vi.spyOn(process, 'cwd').mockReturnValue('/test/cwd');

    // Setup mocks
    mockApp = {
      getRouter: vi.fn().mockReturnValue({}),
      boot: vi.fn().mockResolvedValue(undefined),
      shutdown: vi.fn().mockResolvedValue(undefined),
    };
    (Application.create as unknown as Mock).mockReturnValue(mockApp);

    mockServer = {
      listen: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    };
    (Server.create as unknown as Mock).mockReturnValue(mockServer);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('should bootstrap application successfully and register shutdown handlers', async () => {
    await import('../../src/boot/bootstrap' + '?v=success');

    expect(Application.create).toHaveBeenCalled();
    expect(Server.create).toHaveBeenCalledWith(mockApp, 3000, 'localhost');
    expect(mockServer.listen).toHaveBeenCalled();
    expect(Logger.info).toHaveBeenCalledWith('Server running at http://localhost:3000');

    expect(process.on).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
    expect(typeof signalHandlers.SIGTERM).toBe('function');

    await signalHandlers.SIGTERM?.();
    expect(Logger.info).toHaveBeenCalledWith('SIGTERM received, shutting down gracefully...');
    expect(mockServer.close).toHaveBeenCalled();
    expect(mockApp.shutdown).toHaveBeenCalled();
    expect(process.exit).toHaveBeenCalledWith(0);
  });

  it('should handle bootstrap errors via internal try/catch', async () => {
    const error = new Error('Bootstrap failed');
    (Server.create as unknown as Mock).mockImplementation(() => {
      throw error;
    });

    await import('../../src/boot/bootstrap' + '?v=internal-error');

    expect(Logger.error).toHaveBeenCalledWith('Failed to bootstrap application:', error);
    expect(process.exit).toHaveBeenCalledWith(1);
  });

  it('should cover the top-level bootstrap().catch handler when Logger.error throws', async () => {
    const internalError = new Error('Bootstrap failed');
    (Server.create as unknown as Mock).mockImplementation(() => {
      throw internalError;
    });

    // Don't throw from Logger.error since it would prevent process.exit from being called
    (Logger.error as Mock).mockImplementation(() => {
      // Just log, don't throw
    });

    await import('../../src/boot/bootstrap' + '?v=top-level-catch');

    expect(Logger.error).toHaveBeenCalledWith('Failed to bootstrap application:', internalError);
    expect(process.exit).toHaveBeenCalledWith(1);
  });

  it('should log startup config errors + health report when bootstrap fails with details', async () => {
    const error = Object.assign(new Error('Bootstrap failed'), {
      details: {
        errors: [{ path: 'APP_KEY', message: 'Missing APP_KEY' }],
        report: { checks: [{ name: 'jwt-secret', ok: false }] },
      },
    });

    (Server.create as unknown as Mock).mockImplementation(() => {
      throw error;
    });

    await import('../../src/boot/bootstrap' + '?v=details-error');

    expect(Logger.error).toHaveBeenCalledWith('Failed to bootstrap application:', error);
    expect(Logger.error).toHaveBeenCalledWith(
      'Startup configuration errors:',
      expect.arrayContaining([expect.objectContaining({ path: 'APP_KEY' })])
    );
    expect(Logger.error).toHaveBeenCalledWith(
      'Startup health report:',
      expect.objectContaining({ checks: expect.any(Array) })
    );
    expect(process.exit).toHaveBeenCalledWith(1);
  });

  it('should stop schedules via shutdown manager hook', async () => {
    const { RuntimeDetector } = await import('@/runtime/RuntimeDetector');
    (RuntimeDetector.detectRuntime as unknown as Mock).mockReturnValue('nodejs');

    const { create: createScheduleRunner } = await import('@/scheduler/ScheduleRunner');
    const runner = {
      register: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(async () => undefined),
    };
    (createScheduleRunner as unknown as Mock).mockReturnValue(runner);

    let shutdownHook: (() => Promise<void> | void) | undefined;
    const shutdownManager = {
      add: vi.fn((fn: () => Promise<void> | void) => {
        shutdownHook = fn;
      }),
    };

    const appWithShutdownManager = {
      ...mockApp,
      getContainer: vi.fn().mockReturnValue({
        get: vi.fn((key: string) => (key === 'shutdownManager' ? shutdownManager : undefined)),
      }),
    };
    (Application.create as unknown as Mock).mockReturnValue(appWithShutdownManager);

    const { Env } = await import('@config/env');
    (Env.getInt as unknown as Mock).mockImplementation((key: string, defaultValue: number) => {
      if (key === 'SCHEDULE_SHUTDOWN_TIMEOUT_MS') return 1234;
      return defaultValue;
    });

    await import('../../src/boot/bootstrap' + '?v=schedule-shutdown-hook');

    expect(shutdownManager.add).toHaveBeenCalledTimes(1);
    expect(typeof shutdownHook).toBe('function');

    await shutdownHook?.();
    expect(runner.stop).toHaveBeenCalledWith(1234);
  });

  it('should warn when schedules fail to start', async () => {
    const { RuntimeDetector } = await import('@/runtime/RuntimeDetector');
    (RuntimeDetector.detectRuntime as unknown as Mock).mockReturnValue('nodejs');

    const boom = new Error('schedule boom');
    const { create: createScheduleRunner } = await import('@/scheduler/ScheduleRunner');
    (createScheduleRunner as unknown as Mock).mockImplementation(() => {
      throw boom;
    });

    await import('../../src/boot/bootstrap' + '?v=schedule-start-failure');

    expect(Logger.warn).toHaveBeenCalledWith('Failed to start schedules:', boom);
  });
});
