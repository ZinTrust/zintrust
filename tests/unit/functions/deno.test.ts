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
const mockStartServer = vi.fn<(port: number, host: string) => Promise<void>>();

const DenoAdapterCtor = vi.fn(function DenoAdapter(options: {
  handler: (req: unknown, res: unknown) => Promise<void>;
}) {
  return {
    handle: async (request: Request): Promise<AdapterResponse> => {
      await options.handler({}, {});
      return mockHandle(request);
    },
    formatResponse: mockFormatResponse,
    startServer: async (port: number, host: string): Promise<void> => {
      await options.handler({}, {});
      return mockStartServer(port, host);
    },
  };
});

vi.mock('@runtime/adapters/DenoAdapter', () => ({
  DenoAdapter: DenoAdapterCtor,
}));

vi.mock('@config/logger', () => ({
  Logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

describe('functions/deno', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    mockHandle.mockReset();
    mockFormatResponse.mockReset();
    mockStartServer.mockReset();
  });

  it('returns formatted response on success and caches kernel', async () => {
    mockHandle.mockResolvedValue({
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true }),
    });

    const formatted = new Response('ok', { status: 200 });
    mockFormatResponse.mockReturnValue(formatted);

    const deno = (await import('../../../src/functions/deno' + '?v=success')).default as (
      req: Request
    ) => Promise<Response>;

    const request = new Request('https://example.com/hello', { method: 'GET' });

    const res1 = await deno(request);
    const res2 = await deno(request);

    expect(res1).toBe(formatted);
    expect(res2).toBe(formatted);

    const { Application } = await import('@/Application');
    const { Kernel } = await import('@http/Kernel');

    expect(Application as unknown as Mock).toHaveBeenCalledTimes(1);
    expect(Kernel as unknown as Mock).toHaveBeenCalledTimes(1);
  });

  it('returns 500 JSON response on error', async () => {
    mockHandle.mockRejectedValueOnce(new Error('boom'));

    const deno = (await import('../../../src/functions/deno' + '?v=error')).default as (
      req: Request
    ) => Promise<Response>;

    const request = new Request('https://example.com/hello', { method: 'GET' });

    const response = await deno(request);
    expect(response.status).toBe(500);
    expect(response.headers.get('Content-Type')).toBe('application/json');

    const body = await response.json();
    expect(body).toMatchObject({
      error: 'Internal Server Error',
      statusCode: 500,
    });
  });

  it('starts local server when main flag is enabled', async () => {
    vi.stubGlobal('Deno', {
      env: {
        get: vi.fn((key: string) => {
          if (key === 'PORT') return '4545';
          if (key === 'HOST') return '127.0.0.1';
          return undefined;
        }),
      },
      exit: vi.fn(),
    });

    (globalThis as unknown as { __ZINTRUST_DENO_MAIN__?: boolean }).__ZINTRUST_DENO_MAIN__ = true;
    mockStartServer.mockResolvedValueOnce(undefined);

    const { Logger } = await import('@config/logger');
    await import('../../../src/functions/deno' + '?v=main-ok');

    expect(Logger.info as unknown as Mock).toHaveBeenCalledWith(
      'Starting Deno server on 127.0.0.1:4545...'
    );
    expect(mockStartServer).toHaveBeenCalledWith(4545, '127.0.0.1');
    expect(Logger.error as unknown as Mock).not.toHaveBeenCalled();

    const denoGlobal = (globalThis as unknown as { Deno: { exit: Mock } }).Deno;
    expect(denoGlobal.exit).not.toHaveBeenCalled();

    delete (globalThis as unknown as { __ZINTRUST_DENO_MAIN__?: boolean }).__ZINTRUST_DENO_MAIN__;
    vi.unstubAllGlobals();
  });

  it('uses default host and port when env vars are missing', async () => {
    vi.stubGlobal('Deno', {
      env: {
        get: vi.fn(() => undefined),
      },
      exit: vi.fn(),
    });

    (globalThis as unknown as { __ZINTRUST_DENO_MAIN__?: boolean }).__ZINTRUST_DENO_MAIN__ = true;
    mockStartServer.mockResolvedValueOnce(undefined);

    const { Logger } = await import('@config/logger');
    await import('../../../src/functions/deno' + '?v=main-defaults');

    expect(Logger.info as unknown as Mock).toHaveBeenCalledWith(
      'Starting Deno server on 0.0.0.0:3000...'
    );
    expect(mockStartServer).toHaveBeenCalledWith(3000, '0.0.0.0');
    expect(Logger.error as unknown as Mock).not.toHaveBeenCalled();

    const denoGlobal = (globalThis as unknown as { Deno: { exit: Mock } }).Deno;
    expect(denoGlobal.exit).not.toHaveBeenCalled();

    delete (globalThis as unknown as { __ZINTRUST_DENO_MAIN__?: boolean }).__ZINTRUST_DENO_MAIN__;
    vi.unstubAllGlobals();
  });

  it('exits when local server fails to start', async () => {
    vi.stubGlobal('Deno', {
      env: {
        get: vi.fn((key: string) => {
          if (key === 'PORT') return '4545';
          if (key === 'HOST') return '127.0.0.1';
          return undefined;
        }),
      },
      exit: vi.fn(),
    });

    (globalThis as unknown as { __ZINTRUST_DENO_MAIN__?: boolean }).__ZINTRUST_DENO_MAIN__ = true;
    mockStartServer.mockRejectedValueOnce(new Error('start fail'));

    const { Logger } = await import('@config/logger');
    await import('../../../src/functions/deno' + '?v=main-fail');

    expect(Logger.info as unknown as Mock).toHaveBeenCalledWith(
      'Starting Deno server on 127.0.0.1:4545...'
    );
    expect(mockStartServer).toHaveBeenCalledWith(4545, '127.0.0.1');
    expect(Logger.error as unknown as Mock).toHaveBeenCalledWith(
      'Failed to start server:',
      expect.any(Error)
    );

    const denoGlobal = (globalThis as unknown as { Deno: { exit: Mock } }).Deno;
    expect(denoGlobal.exit).toHaveBeenCalledWith(1);

    delete (globalThis as unknown as { __ZINTRUST_DENO_MAIN__?: boolean }).__ZINTRUST_DENO_MAIN__;
    vi.unstubAllGlobals();
  });
});
