/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockState = vi.hoisted(() => ({
  workersEnv: null as unknown,
  socketsEnabled: false,
  transportMode: 'direct' as string,
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
  proxyClient: {} as any,
}));

vi.mock('@config/logger', () => ({ Logger: mockState.logger }));
vi.mock('@runtime/StartupConfigFileRegistry', () => ({
  StartupConfigFileRegistry: { get: () => undefined },
  StartupConfigFile: { Workers: 'Workers' },
}));
vi.mock('@config/cloudflare', () => ({
  Cloudflare: {
    getWorkersEnv: () => mockState.workersEnv,
    isCloudflareSocketsEnabled: () => mockState.socketsEnabled,
  },
}));
vi.mock('@tools/redis/RedisTransport', () => ({
  ensureRedisTransportMode: () => mockState.transportMode,
  createRedisProxyConnection: () => mockState.proxyClient,
}));

type Client = {
  status?: string;
  quit?: ReturnType<typeof vi.fn>;
  disconnect?: ReturnType<typeof vi.fn>;
  on?: ReturnType<typeof vi.fn>;
  handlers?: Record<string, (err: Error) => void>;
  __zintrustRedisLifecycleManaged__?: boolean;
};

class TestRedis {
  static instances: Client[] = [];
  static factory: (config?: unknown) => Client = () => {
    const client: Client = {
      status: 'ready',
      quit: vi.fn(async () => 'OK'),
      disconnect: vi.fn(),
      handlers: {},
      on: vi.fn((event: string, handler: (err: Error) => void) => {
        if (client.handlers) client.handlers[event] = handler;
        return client;
      }),
    };
    TestRedis.instances.push(client);
    return client;
  };

  constructor(config?: unknown) {
    Object.assign(this, TestRedis.factory(config));
  }
}

const injectRedis = (Redis: unknown): void => {
  (globalThis as any).__zintrustIoredisModule = { Redis };
};

const baseConfig = {
  host: 'localhost',
  port: 6379,
  password: 'pass',
  db: 0,
};

describe('workers config uncovered branches', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetModules();
    mockState.workersEnv = null;
    mockState.socketsEnabled = false;
    mockState.transportMode = 'direct';
    injectRedis(TestRedis);
    TestRedis.instances = [];
    TestRedis.factory = () => {
      const client: Client = {
        status: 'ready',
        quit: vi.fn(async () => 'OK'),
        disconnect: vi.fn(),
        handlers: {},
        on: vi.fn((event: string, handler: (err: Error) => void) => {
          if (client.handlers) client.handlers[event] = handler;
          return client;
        }),
      };
      TestRedis.instances.push(client);
      return client;
    };
    mockState.logger.info.mockReset();
    mockState.logger.warn.mockReset();
    mockState.logger.error.mockReset();
    delete (globalThis as any).__zintrustRedisConnectionRegistry__;
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    delete (globalThis as any).__zintrustIoredisModule;
    delete (globalThis as any).__zintrustRedisConnectionRegistry__;
  });

  it('skips quit when the client has no quit function and handles disconnect errors', async () => {
    TestRedis.factory = () => {
      const client: Client = {
        quit: undefined,
        disconnect: vi.fn(() => {
          throw new Error('disconnect failed');
        }),
      };
      TestRedis.instances.push(client);
      return client;
    };
    const { createRedisConnection, shutdownRedisConnections } = await import('@config/workers');

    createRedisConnection(baseConfig, 3, { subsystem: 'queue-bullmq' });
    await expect(shutdownRedisConnections()).resolves.toBeUndefined();
    expect(mockState.logger.warn).not.toHaveBeenCalled();
    expect(mockState.logger.error).not.toHaveBeenCalled();
  });

  it('forces a disconnect when quit rejects and logs tracked shutdown failures', async () => {
    TestRedis.factory = () => {
      const client: Client = {
        quit: vi.fn(async () => {
          throw new Error('quit failed');
        }),
        disconnect: vi.fn(() => {
          throw new Error('disconnect failed');
        }),
        on: vi.fn(),
      };
      TestRedis.instances.push(client);
      return client;
    };
    const { createRedisConnection, shutdownRedisConnections } = await import('@config/workers');

    createRedisConnection(baseConfig, 3, { subsystem: 'worker-queue' });
    await shutdownRedisConnections();

    expect(mockState.logger.warn).toHaveBeenCalledWith(
      'Tracked Redis graceful shutdown failed, forcing disconnect',
      expect.any(Error)
    );
    expect(TestRedis.instances[0]?.disconnect).toHaveBeenCalled();
    expect(mockState.logger.error).toHaveBeenCalledWith(
      'Tracked Redis forced disconnect failed',
      expect.any(Error)
    );
  });

  it('returns early for lifecycle-managed clients and skips error handler setup', async () => {
    TestRedis.factory = () => {
      const client: Client = {
        __zintrustRedisLifecycleManaged__: true,
        quit: vi.fn(async () => 'OK'),
        disconnect: vi.fn(),
      };
      TestRedis.instances.push(client);
      return client;
    };
    const { createRedisConnection, shutdownRedisConnections } = await import('@config/workers');

    const client = createRedisConnection(baseConfig, 3, { subsystem: 'queue-bullmq' });
    expect(client.on).toBeUndefined();
    await shutdownRedisConnections();
    expect(client.quit).toHaveBeenCalled();
  });

  it('recreates a cached client whose status is not reusable', async () => {
    const { createRedisConnection } = await import('@config/workers');

    const first = createRedisConnection(baseConfig, 3, { subsystem: 'queue-bullmq' });
    (first as Client).status = 'end';
    const second = createRedisConnection(baseConfig, 3, { subsystem: 'queue-bullmq' });

    expect(second).not.toBe(first);
  });

  it('throws when no Redis constructor can be resolved', async () => {
    injectRedis({ Redis: 42, default: {} });
    const { createRedisConnection } = await import('@config/workers');

    expect(() => createRedisConnection(baseConfig, 3, { subsystem: 'queue-bullmq' })).toThrow(
      /could not resolve a Redis constructor/i
    );
  });

  it('handles WRONGPASS and generic Redis error handler branches', async () => {
    const { createRedisConnection } = await import('@config/workers');
    const client = createRedisConnection(baseConfig, 3, { subsystem: 'queue-bullmq' }) as Client;

    client.handlers?.['error']?.(new Error('WRONGPASS bad password'));
    expect(mockState.logger.error).toHaveBeenCalledWith(
      expect.stringContaining('WRONGPASS')
    );

    client.handlers?.['error']?.(new Error('generic failure'));
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[workers][redis] Redis error:',
      'generic failure'
    );
  });

  it('falls back to standard env config when node runtime targets an HTTP proxy', async () => {
    vi.stubEnv('REDIS_PROXY_URL', 'https://proxy.example:443/redis');
    vi.stubEnv('REDIS_PROXY_HOST', 'proxy.example');
    vi.stubEnv('REDIS_PROXY_PORT', '443');
    vi.stubEnv('REDIS_HOST', 'redis.example');
    vi.stubEnv('REDIS_PORT', '6379');

    const { createRedisConnection } = await import('@config/workers');
    createRedisConnection({ ...baseConfig, host: 'proxy.example', port: 443 }, 3, {
      subsystem: 'queue-bullmq',
    });

    expect(mockState.logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Detected Redis config pointing to HTTP proxy endpoint')
    );
    expect(TestRedis.instances[0]).toBeDefined();
    vi.stubEnv('REDIS_PROXY_URL', 'ftp://proxy.example:21/redis');
    expect(() => createRedisConnection({ ...baseConfig, host: 'proxy.example', port: 21 })).not.toThrow();
  });

  it('rejects configs that still target an HTTP proxy endpoint', async () => {
    vi.stubEnv('REDIS_PROXY_URL', 'http://127.0.0.1:8791/redis');
    vi.stubEnv('REDIS_HOST', '127.0.0.1');
    vi.stubEnv('REDIS_PORT', '8791');

    const { createRedisConnection } = await import('@config/workers');
    expect(() => createRedisConnection({ ...baseConfig, host: '127.0.0.1', port: 8791 })).toThrow(
      /points to an HTTP proxy endpoint/i
    );
  });

  it('requires Cloudflare sockets in Workers runtime when proxy is disabled', async () => {
    mockState.workersEnv = {};
    mockState.socketsEnabled = false;

    const { createRedisConnection } = await import('@config/workers');
    expect(() => createRedisConnection(baseConfig)).toThrow(/ENABLE_CLOUDFLARE_SOCKETS=true/);

    mockState.socketsEnabled = true;
    expect(() => createRedisConnection(baseConfig)).not.toThrow();
  });

  it('uses proxy transports for proxy, rpc and zedgi modes', async () => {
    mockState.proxyClient = { marker: 'proxy' } as any;
    const { createRedisConnection } = await import('@config/workers');

    for (const mode of ['proxy', 'rpc', 'zedgi']) {
      mockState.transportMode = mode;
      expect(createRedisConnection(baseConfig)).toBe(mockState.proxyClient);
    }

    mockState.transportMode = 'proxy';
    expect(createRedisConnection(baseConfig, 3, { subsystem: 'queue-monitor' })).not.toBe(
      mockState.proxyClient
    );

    mockState.transportMode = 'zedgi';
    expect(createRedisConnection(baseConfig, 3, { subsystem: 'queue-monitor' })).toBe(
      mockState.proxyClient
    );
  });
});
