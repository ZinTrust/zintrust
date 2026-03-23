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

    const { Application } = await import('@boot/Application');
    const { Kernel } = await import('@http/Kernel');

    expect(Application.create as unknown as Mock).toHaveBeenCalledTimes(1);
    expect(Kernel.create as unknown as Mock).toHaveBeenCalledTimes(1);
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
});
