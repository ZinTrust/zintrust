import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

const handleRequest = vi.fn().mockResolvedValue(undefined);

vi.mock('@boot/Application', () => {
  const createAppMock = () => ({
    boot: vi.fn().mockResolvedValue(undefined),
    getRouter: vi.fn().mockReturnValue({}),
    getMiddlewareStack: vi.fn().mockReturnValue({}),
    getContainer: vi.fn().mockReturnValue({}),
  });

  return {
    Application: {
      create: vi.fn(createAppMock),
    },
  };
});

vi.mock('@http/Kernel', () => ({
  Kernel: {
    create: vi.fn(() => ({
      handle: vi.fn().mockResolvedValue(undefined),
      handleRequest,
    })),
  },
}));

vi.mock('@runtime/getKernel', () => ({
  getKernel: vi.fn(async () => ({
    handle: vi.fn().mockResolvedValue(undefined),
  })),
}));

type AdapterResponse = {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
};

const mockHandle = vi.fn<(request: any) => Promise<AdapterResponse>>();
const mockFormatResponse = vi.fn<(response: AdapterResponse) => any>();

vi.mock('@runtime/adapters/CloudflareAdapter', () => ({
  CloudflareAdapter: {
    create: vi.fn((options: { handler: (req: unknown, res: unknown) => Promise<void> }) => ({
      handle: async (request: any): Promise<AdapterResponse> => {
        await options.handler({}, {});
        return mockHandle(request);
      },
      formatResponse: mockFormatResponse,
    })),
  },
}));

vi.mock('@config/logger', () => ({
  Logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

describe('functions/cloudflare', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHandle.mockReset();
    mockFormatResponse.mockReset();
    delete (globalThis as { __zintrustStartupConfigOverrides?: Map<string, unknown> })
      .__zintrustStartupConfigOverrides;
    delete (globalThis as { env?: unknown }).env;
  });

  afterEach(() => {
    delete (globalThis as { env?: unknown }).env;
    vi.doUnmock('@runtime/StartupConfigFileRegistry');
    vi.doUnmock('@config/middleware');
  });

  it('handles fetch success and caches kernel', async () => {
    mockHandle.mockResolvedValue({
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true }),
    });

    const formatted = { status: 200 } as any;
    mockFormatResponse.mockReturnValue(formatted);

    const mod = await import('../../../src/functions/cloudflare' + '?v=success');
    const handler = (
      mod.default as { fetch: (req: any, env: unknown, ctx: unknown) => Promise<any> }
    ).fetch;

    const request = { url: 'https://example.com/hello', method: 'GET' } as any;

    const res1 = await handler(request, {}, {});
    const res2 = await handler(request, {}, {});

    const { Logger } = await import('@config/logger');
    if (res1.status !== 200 || res2.status !== 200) {
      const calls = (Logger.error as unknown as Mock).mock.calls;
      const lastError = calls.at(-1)?.[1] as unknown;
      const message = lastError instanceof Error ? lastError.message : JSON.stringify(lastError);
      throw new Error(
        `Expected success responses; got ${res1.status}/${res2.status}. Logged error: ${message}`
      );
    }

    expect(res1).toBe(formatted);
    expect(res2).toBe(formatted);
    expect(Logger.error as unknown as Mock).not.toHaveBeenCalled();

    const { getKernel } = await import('@runtime/getKernel');

    expect(getKernel as unknown as Mock).toHaveBeenCalledTimes(2);
    expect(mockHandle).toHaveBeenCalledTimes(2);
    expect(mockFormatResponse).toHaveBeenCalledTimes(2);
  });

  it('returns 500 JSON response on fetch error', async () => {
    mockHandle.mockRejectedValueOnce(new Error('boom'));

    const mod = await import('../../../src/functions/cloudflare' + '?v=error');
    const handler = mod.default.fetch;

    const request = { url: 'https://example.com/hello', method: 'GET' } as any;

    const response = await handler(request, {}, {});
    expect(response.status).toBe(500);

    const body = await response.text();
    expect(body).toBe('Internal Server Error');
  });

  it('logs structured startup diagnostics when worker boot fails', async () => {
    mockHandle.mockRejectedValueOnce(
      Object.assign(new Error('Startup health checks failed'), {
        details: {
          errors: [{ key: 'ENCRYPTION_CIPHER', message: 'ENCRYPTION_CIPHER must be set' }],
          warnings: [{ key: 'HOST', message: 'HOST is recommended' }],
          report: { checks: [{ name: 'startup.secrets', ok: false }] },
        },
      })
    );

    const mod = await import('../../../src/functions/cloudflare' + '?v=structured-startup-error');
    const handler = mod.default.fetch;

    const response = await handler(
      { url: 'https://example.com/hello', method: 'GET' } as any,
      {},
      {}
    );

    expect(response.status).toBe(500);

    const { Logger } = await import('@config/logger');
    expect(Logger.error).toHaveBeenCalledWith(
      'Cloudflare startup configuration errors:',
      expect.arrayContaining([expect.objectContaining({ key: 'ENCRYPTION_CIPHER' })])
    );
    expect(Logger.warn).toHaveBeenCalledWith(
      'Cloudflare startup configuration warnings:',
      expect.arrayContaining([expect.objectContaining({ key: 'HOST' })])
    );
    expect(Logger.error).toHaveBeenCalledWith(
      'Cloudflare startup health report:',
      expect.objectContaining({ checks: expect.any(Array) })
    );
  });

  it('handles fetch requests with proper mocking', async () => {
    mockHandle.mockResolvedValue({
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true }),
    });

    const formatted = { status: 200 } as any;
    mockFormatResponse.mockReturnValue(formatted);

    const mod = await import('../../../src/functions/cloudflare' + '?v=test');
    const handler = mod.default.fetch;

    const request = { url: 'https://example.com/test', method: 'GET' } as any;

    const response = await handler(request, {}, {});
    expect(response).toBe(formatted);
  });

  it('merges root and service-local startup config overrides for worker services', async () => {
    vi.resetModules();

    const { ProjectRuntime } = await import('../../../src/runtime/ProjectRuntime');
    ProjectRuntime.clear();
    ProjectRuntime.set({
      activeService: {
        id: 'ecommerce/users',
        domain: 'ecommerce',
        name: 'users',
        configRoot: 'src/services/ecommerce/users/config',
      },
    });

    vi.doMock('@runtime-config/cache.ts', () => ({
      default: { default: 'memory', drivers: { memory: { ttl: 30 } }, ttl: 30 },
    }));
    vi.doMock('@service-runtime-config/cache.ts', () => ({
      default: { drivers: { memory: { ttl: 90 } }, keyPrefix: 'users:' },
    }));

    mockHandle.mockResolvedValue({
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true }),
    });
    mockFormatResponse.mockReturnValue({ status: 200 } as any);

    const mod = await import('../../../src/functions/cloudflare' + '?v=service-config-merge');
    const handler = mod.default.fetch;

    await handler({ url: 'https://example.com/service', method: 'GET' } as any, {}, {});

    const overrides = (globalThis as { __zintrustStartupConfigOverrides?: Map<string, unknown> })
      .__zintrustStartupConfigOverrides;

    expect(overrides?.get('config/cache.ts')).toEqual({
      default: 'memory',
      drivers: { memory: { ttl: 90 } },
      ttl: 30,
      keyPrefix: 'users:',
    });

    ProjectRuntime.clear();
    delete (globalThis as { __zintrustStartupConfigOverrides?: Map<string, unknown> })
      .__zintrustStartupConfigOverrides;
  });

  it('merges injected worker env snapshot into bindings before routes load', async () => {
    mockHandle.mockResolvedValue({
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true }),
    });
    mockFormatResponse.mockReturnValue({ status: 200 } as any);

    const mod = await import('../../../src/functions/cloudflare' + '?v=env-snapshot');
    const handler = mod.default.fetch;

    await handler(
      { url: 'https://example.com/env-snapshot', method: 'GET' } as any,
      {
        ZINTRUST_WORKER_ENV_SNAPSHOT: JSON.stringify({
          APP_NAME: 'fresh-check',
          MS_ROOT_ONLY: 'x',
        }),
        MS_SERVICE_ONLY: 'y',
      },
      {}
    );

    expect((globalThis as { env?: unknown }).env).toEqual({
      APP_NAME: 'fresh-check',
      MS_ROOT_ONLY: 'x',
      MS_SERVICE_ONLY: 'y',
    });
  });

  it('preloads startup config overrides into the registry before kernel creation', async () => {
    vi.resetModules();

    const clearRegistry = vi.fn();
    const preloadRegistry = vi.fn().mockResolvedValue(undefined);
    const clearMiddleware = vi.fn();

    vi.doMock('@runtime/StartupConfigFileRegistry', () => ({
      StartupConfigFileRegistry: {
        clear: clearRegistry,
        preload: preloadRegistry,
        get: vi.fn(),
        has: vi.fn(),
        isPreloaded: vi.fn(),
      },
      StartupConfigFile: {
        Broadcast: 'config/broadcast.ts',
        Cache: 'config/cache.ts',
        Database: 'config/database.ts',
        Mail: 'config/mail.ts',
        Trace: 'config/trace.ts',
        Middleware: 'config/middleware.ts',
        Notification: 'config/notification.ts',
        Queue: 'config/queue.ts',
        Storage: 'config/storage.ts',
        Workers: 'config/workers.ts',
      },
    }));

    vi.doMock('@config/middleware', () => ({
      clearMiddlewareConfigCache: clearMiddleware,
    }));

    mockHandle.mockResolvedValue({
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true }),
    });
    mockFormatResponse.mockReturnValue({ status: 200 } as any);

    const mod = await import('../../../src/functions/cloudflare' + '?v=registry-preload');
    const handler = mod.default.fetch;

    await handler({ url: 'https://example.com/preload', method: 'GET' } as any, {}, {});

    expect(clearRegistry).toHaveBeenCalled();
    expect(clearMiddleware).toHaveBeenCalled();
    expect(preloadRegistry).toHaveBeenCalledWith([
      'config/broadcast.ts',
      'config/cache.ts',
      'config/database.ts',
      'config/mail.ts',
      'config/trace.ts',
      'config/middleware.ts',
      'config/notification.ts',
      'config/queue.ts',
      'config/storage.ts',
      'config/workers.ts',
    ]);
  });

  it('loads root middleware overrides into worker startup config cache', async () => {
    vi.resetModules();

    const authOverride = vi.fn(async () => undefined);

    vi.doMock('@runtime-config/middleware.ts', () => ({
      default: {
        route: {
          auth: authOverride,
        },
      },
    }));

    mockHandle.mockResolvedValue({
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true }),
    });
    mockFormatResponse.mockReturnValue({ status: 200 } as any);

    const mod = await import('../../../src/functions/cloudflare' + '?v=root-middleware-override');
    const handler = mod.default.fetch;

    await handler({ url: 'https://example.com/root-middleware', method: 'GET' } as any, {}, {});

    const overrides = (globalThis as { __zintrustStartupConfigOverrides?: Map<string, unknown> })
      .__zintrustStartupConfigOverrides;
    const middlewareOverride = overrides?.get('config/middleware.ts') as
      | { route?: { auth?: unknown } }
      | undefined;

    expect(middlewareOverride?.route?.auth).toBe(authOverride);
  });
});
