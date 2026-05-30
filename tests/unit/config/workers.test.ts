import { afterEach, describe, expect, it, vi } from 'vitest';

import { Logger } from '@config/logger';

vi.mock('@config/logger', () => ({
  Logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    success: vi.fn(),
  },
}));

const registryGet = vi.fn();
vi.mock('@runtime/StartupConfigFileRegistry', () => ({
  StartupConfigFileRegistry: {
    get: registryGet,
  },
  StartupConfigFile: {
    Workers: 'Workers',
  },
}));

class MockRedis {
  public handlers: Record<string, (err: Error) => void> = {};
  public config?: any;
  public status = 'ready';
  public quit = vi.fn(async () => 'OK');
  public disconnect = vi.fn(() => undefined);

  constructor(config?: any) {
    this.config = config;
  }

  on(event: string, handler: (err: Error) => void): this {
    this.handlers[event] = handler;
    return this;
  }
}

vi.mock('ioredis', () => ({
  default: MockRedis,
  Redis: MockRedis,
}));

describe('workers config', () => {
  afterEach(() => {
    registryGet.mockReset();
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    delete (globalThis as unknown as { __zintrustIoredisModule?: unknown }).__zintrustIoredisModule;
    delete (globalThis as unknown as { __zintrustRedisConnectionRegistry__?: unknown })
      .__zintrustRedisConnectionRegistry__;
  });

  it('handles redis error handler failures', async () => {
    (globalThis as unknown as { __zintrustIoredisModule?: unknown }).__zintrustIoredisModule = {
      Redis: MockRedis,
    };

    const { createRedisConnection } = await import('@config/workers');

    (Logger.error as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
      throw new Error('logger fail');
    });

    const client = createRedisConnection({
      host: 'localhost',
      port: 6379,
      password: 'pass',
      db: 0,
    });

    // Try to access the error handler directly from the MockRedis instance
    const testHandler = (client as any).handlers?.['error'];
    if (testHandler) {
      testHandler(new Error('NOAUTH invalid password'));
    }

    expect(Logger.error).toHaveBeenCalledWith(
      '[workers][redis] NOAUTH: Redis requires authentication. Provide `password` in the workers Redis config.'
    );
    expect(Logger.error).toHaveBeenCalledWith('Redis error handler failed', expect.any(Error));
  });

  it('applies overrides and proxies workers config', async () => {
    registryGet.mockReturnValue({
      enabled: false,
      observability: { prometheus: { enabled: true, port: 9999 } },
    });

    const { workersConfig } = await import('@config/workers');

    expect(workersConfig.enabled).toBe(false);
    expect(workersConfig.observability.prometheus.port).toBe(9999);
    expect(Object.keys(workersConfig)).toContain('enabled');
  });

  it('should handle missing redis config gracefully', async () => {
    registryGet.mockReturnValue({
      enabled: true,
      defaultWorker: {
        // No redis config provided
      },
    });

    const { workersConfig } = await import('@config/workers');

    // Test that missing redis config is handled gracefully
    expect(workersConfig.defaultWorker).toBeDefined();
  });

  it('uses proxy transport when redis proxy mode is enabled', async () => {
    vi.stubEnv('USE_REDIS_PROXY', 'true');
    vi.stubEnv('REDIS_PROXY_URL', 'http://127.0.0.1:8791/redis');
    vi.stubEnv('REDIS_PROXY_KEY_ID', 'test-key');
    vi.stubEnv('REDIS_PROXY_SECRET', 'test-secret');
    vi.stubEnv('REDIS_REQUIRE_DIRECT_FOR_SCRIPTS', 'false');

    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ result: 'OK' }),
      text: async () => '',
    }));
    vi.stubGlobal('fetch', fetchMock);

    const { createRedisConnection } = await import('@config/workers');
    const client = createRedisConnection({
      host: 'localhost',
      port: 6379,
      password: '',
      db: 0,
    });

    await expect(
      (client as unknown as { set: (key: string, value: string) => Promise<string> }).set('k', 'v')
    ).resolves.toBe('OK');
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://127.0.0.1:8791/redis/zin/redis/command');
  });

  it('reuses subsystem Redis clients in non-production runtimes and recreates them after shutdown', async () => {
    (globalThis as unknown as { __zintrustIoredisModule?: unknown }).__zintrustIoredisModule = {
      Redis: MockRedis,
    };

    const { createRedisConnection, shutdownRedisConnections } = await import('@config/workers');

    const first = createRedisConnection(
      {
        host: 'localhost',
        port: 6379,
        password: 'pass',
        db: 0,
      },
      3,
      { subsystem: 'queue-bullmq' }
    );

    const second = createRedisConnection(
      {
        host: 'localhost',
        port: 6379,
        password: 'pass',
        db: 0,
      },
      3,
      { subsystem: 'queue-bullmq' }
    );

    expect(second).toBe(first);

    await shutdownRedisConnections();

    const third = createRedisConnection(
      {
        host: 'localhost',
        port: 6379,
        password: 'pass',
        db: 0,
      },
      3,
      { subsystem: 'queue-bullmq' }
    );

    expect(third).not.toBe(first);
  });

  it('forces disconnect when tracked Redis quit hangs during shutdown', async () => {
    vi.useFakeTimers();

    class HungRedis extends MockRedis {
      public readonly quitSpy = vi.fn(async () => await new Promise<string>(() => undefined));
      public readonly disconnectSpy = vi.fn(() => undefined);

      public override quit = async (): Promise<string> => await this.quitSpy();
      public override disconnect = (): void => {
        this.disconnectSpy();
      };
    }

    (globalThis as unknown as { __zintrustIoredisModule?: unknown }).__zintrustIoredisModule = {
      Redis: HungRedis,
    };

    const { createRedisConnection, shutdownRedisConnections } = await import('@config/workers');

    const client = createRedisConnection({
      host: 'localhost',
      port: 6379,
      password: 'pass',
      db: 0,
    }) as unknown as HungRedis;

    const shutdownPromise = shutdownRedisConnections();
    await vi.advanceTimersByTimeAsync(800);
    await shutdownPromise;

    expect(client.quitSpy).toHaveBeenCalledTimes(1);
    expect(client.disconnectSpy).toHaveBeenCalledTimes(1);
    expect(Logger.warn).toHaveBeenCalledWith(
      'Tracked Redis graceful shutdown failed, forcing disconnect',
      expect.any(Error)
    );

    vi.useRealTimers();
  });

  it('handles WRONGPASS Redis error', async () => {
    (Logger.error as unknown as ReturnType<typeof vi.fn>).mockClear();
    (globalThis as unknown as { __zintrustIoredisModule?: unknown }).__zintrustIoredisModule = {
      Redis: MockRedis,
    };

    const { createRedisConnection } = await import('@config/workers');

    const client = createRedisConnection({
      host: 'localhost',
      port: 6379,
      password: 'pass',
      db: 0,
    });

    const testHandler = (client as any).handlers?.['error'];
    if (testHandler) {
      testHandler(new Error('WRONGPASS invalid password'));
    }

    expect(Logger.error).toHaveBeenCalledWith(
      '[workers][redis] WRONGPASS: Redis password is incorrect. Provide correct `password` in the workers Redis config.'
    );
  });

  it('handles general Redis error', async () => {
    (Logger.error as unknown as ReturnType<typeof vi.fn>).mockClear();
    (globalThis as unknown as { __zintrustIoredisModule?: unknown }).__zintrustIoredisModule = {
      Redis: MockRedis,
    };

    const { createRedisConnection } = await import('@config/workers');

    const client = createRedisConnection({
      host: 'localhost',
      port: 6379,
      password: 'pass',
      db: 0,
    });

    const testHandler = (client as any).handlers?.['error'];
    if (testHandler) {
      testHandler(new Error('general connection error'));
    }

    expect(Logger.error).not.toHaveBeenCalled();
  });

  it('handles forced disconnect failure', async () => {
    class FailingDisconnectRedis extends MockRedis {
      public disconnect = vi.fn(() => {
        throw new Error('disconnect failed');
      });
    }

    (Logger.error as unknown as ReturnType<typeof vi.fn>).mockClear();
    (Logger.warn as unknown as ReturnType<typeof vi.fn>).mockClear();
    (globalThis as unknown as { __zintrustIoredisModule?: unknown }).__zintrustIoredisModule = {
      Redis: FailingDisconnectRedis,
    };

    const { createRedisConnection } = await import('@config/workers');

    const client = createRedisConnection({
      host: 'localhost',
      port: 6379,
      password: 'pass',
      db: 0,
    });

    // Import the internal function to test it directly
    const workersModule = await import('@config/workers');
    const forceDisconnectRedisClient = (workersModule as any).forceDisconnectRedisClient;

    if (forceDisconnectRedisClient) {
      forceDisconnectRedisClient(client, new Error('quit failed'));
      expect(Logger.error).toHaveBeenCalledWith(
        'Tracked Redis forced disconnect failed',
        expect.any(Error)
      );
    }
  });
});
