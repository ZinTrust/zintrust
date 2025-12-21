import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

const handleRequest = vi.fn().mockResolvedValue(undefined);

const ApplicationCtor = vi.fn(function Application() {
  return {
    getRouter: vi.fn().mockReturnValue({}),
    getMiddlewareStack: vi.fn().mockReturnValue({}),
    getContainer: vi.fn().mockReturnValue({}),
  };
});

const KernelCtor = vi.fn(function Kernel() {
  return {
    handleRequest,
  };
});

vi.mock('@/Application', () => ({
  Application: ApplicationCtor,
}));

vi.mock('@http/Kernel', () => ({
  Kernel: KernelCtor,
}));

type AdapterResponse = {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
};

const mockHandle = vi.fn<(request: Request) => Promise<AdapterResponse>>();
const mockFormatResponse = vi.fn<(response: AdapterResponse) => Response>();

const CloudflareAdapterCtor = vi.fn(function CloudflareAdapter(options: {
  handler: (req: unknown, res: unknown) => Promise<void>;
}) {
  return {
    handle: async (request: Request): Promise<AdapterResponse> => {
      await options.handler({}, {});
      return mockHandle(request);
    },
    formatResponse: mockFormatResponse,
  };
});

vi.mock('@runtime/adapters/CloudflareAdapter', () => ({
  CloudflareAdapter: CloudflareAdapterCtor,
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
    vi.resetModules();

    mockHandle.mockReset();
    mockFormatResponse.mockReset();
  });

  it('handles fetch success and caches kernel', async () => {
    mockHandle.mockResolvedValue({
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true }),
    });

    const formatted = new Response('ok', { status: 200 });
    mockFormatResponse.mockReturnValue(formatted);

    const mod = await import('../../../src/functions/cloudflare' + '?v=success');
    const handler = (
      mod.default as { fetch: (req: Request, env: unknown, ctx: unknown) => Promise<Response> }
    ).fetch;

    const request = new Request('https://example.com/hello', { method: 'GET' });

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

    const { Application } = await import('@/Application');
    const { Kernel } = await import('@http/Kernel');

    expect(Application as unknown as Mock).toHaveBeenCalledTimes(1);
    expect(Kernel as unknown as Mock).toHaveBeenCalledTimes(1);
    expect(mockHandle).toHaveBeenCalledTimes(2);
    expect(mockFormatResponse).toHaveBeenCalledTimes(2);
  });

  it('returns 500 JSON response on fetch error', async () => {
    mockHandle.mockRejectedValueOnce(new Error('boom'));

    const mod = await import('../../../src/functions/cloudflare' + '?v=error');
    const handler = (
      mod.default as { fetch: (req: Request, env: unknown, ctx: unknown) => Promise<Response> }
    ).fetch;

    const request = new Request('https://example.com/hello', { method: 'GET' });

    const response = await handler(request, {}, {});
    expect(response.status).toBe(500);
    expect(response.headers.get('Content-Type')).toBe('application/json');

    const body = await response.json();
    expect(body).toMatchObject({
      error: 'Internal Server Error',
      statusCode: 500,
    });
  });

  it('logs scheduled events', async () => {
    const mod = await import('../../../src/functions/cloudflare' + '?v=scheduled');
    const scheduled = (
      mod.default as {
        scheduled: (event: { cron: string }, env: unknown, ctx: unknown) => Promise<void>;
      }
    ).scheduled;

    const { Logger } = await import('@config/logger');

    await scheduled({ cron: '* * * * *' }, {}, {});

    expect(Logger.info as unknown as Mock).toHaveBeenCalledWith('Cron job triggered:', {
      cron: '* * * * *',
    });
  });
});
