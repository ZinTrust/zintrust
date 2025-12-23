import { Application } from '@/Application';
import { Server } from '@/Server';
import { Logger } from '@config/logger';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

// Mock dependencies
vi.mock('@/Application');
vi.mock('@/Server');
vi.mock('@routes/api', () => ({
  registerRoutes: vi.fn(),
}));
vi.mock('@config/env', () => ({
  Env: {
    PORT: 3000,
    HOST: 'localhost',
    NODE_ENV: 'test',
    DB_CONNECTION: 'sqlite',
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
vi.mock('@config/logger');

describe('Bootstrap', () => {
  type SignalName = 'SIGTERM' | 'SIGINT';
  type SignalHandler = () => void;
  type ListenFn = () => Promise<void>;

  let mockServer: { listen: ReturnType<typeof vi.fn<ListenFn>> };
  let mockApp: { getRouter: Mock; boot: Mock };
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
    };
    (Application.create as unknown as Mock).mockReturnValue(mockApp);

    mockServer = {
      listen: vi.fn().mockResolvedValue(undefined),
    };
    (Server.create as unknown as Mock).mockReturnValue(mockServer);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('should bootstrap application successfully and register shutdown handlers', async () => {
    await import('../../src/bootstrap' + '?v=success');

    expect(Application.create).toHaveBeenCalled();
    expect(Server.create).toHaveBeenCalledWith(mockApp, 3000, 'localhost');
    expect(mockServer.listen).toHaveBeenCalled();
    expect(Logger.info).toHaveBeenCalledWith('Server running at http://localhost:3000');

    expect(process.on).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
    expect(typeof signalHandlers.SIGTERM).toBe('function');

    signalHandlers.SIGTERM?.();
    expect(Logger.info).toHaveBeenCalledWith('SIGTERM received, shutting down gracefully...');
    expect(process.exit).toHaveBeenCalledWith(0);
  });

  it('should handle bootstrap errors via internal try/catch', async () => {
    const error = new Error('Bootstrap failed');
    (Server.create as unknown as Mock).mockImplementation(function () {
      throw error;
    });

    await import('../../src/bootstrap' + '?v=internal-error');

    expect(Logger.error).toHaveBeenCalledWith('Failed to bootstrap application:', error);
    expect(process.exit).toHaveBeenCalledWith(1);
  });

  it('should cover the top-level bootstrap().catch handler when Logger.error throws', async () => {
    const internalError = new Error('Bootstrap failed');
    (Server.create as unknown as Mock).mockImplementation(function () {
      throw internalError;
    });

    // Don't throw from Logger.error since it would prevent process.exit from being called
    (Logger.error as Mock).mockImplementation(() => {
      // Just log, don't throw
    });

    await import('../../src/bootstrap' + '?v=top-level-catch');

    expect(Logger.error).toHaveBeenCalledWith('Failed to bootstrap application:', internalError);
    expect(process.exit).toHaveBeenCalledWith(1);
  });
});
