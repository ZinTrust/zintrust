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

type PlatformResponse = {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
};

const mockHandle =
  vi.fn<(event: unknown, context: { requestId: string }) => Promise<PlatformResponse>>();

const LambdaAdapterCtor = vi.fn(function LambdaAdapter(options: {
  handler: (req: unknown, res: unknown) => Promise<void>;
}) {
  return {
    handle: async (event: unknown, context: { requestId: string }): Promise<PlatformResponse> => {
      await options.handler({}, {});
      return mockHandle(event, context);
    },
  };
});

vi.mock('@runtime/adapters/LambdaAdapter', () => ({
  LambdaAdapter: LambdaAdapterCtor,
}));

vi.mock('@config/logger', () => ({
  Logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

describe('functions/lambda', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    mockHandle.mockReset();
  });

  it('handler returns adapter response and logs execution summary', async () => {
    mockHandle.mockResolvedValue({
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true }),
    });

    const { handler } = await import('../../../src/functions/lambda' + '?v=success');
    const { Logger } = await import('@config/logger');

    const { Application } = await import('@/Application');
    const { Kernel } = await import('@http/Kernel');

    const res1 = await handler(
      { rawPath: '/health', httpMethod: 'GET' },
      {
        requestId: 'req-1',
        functionName: 'fn',
        functionVersion: '1',
        memoryLimitInMB: '128',
      }
    );

    const res2 = await handler(
      { rawPath: '/health', httpMethod: 'GET' },
      {
        requestId: 'req-1b',
        functionName: 'fn',
        functionVersion: '1',
        memoryLimitInMB: '128',
      }
    );

    expect(res1.statusCode).toBe(200);
    expect(res2.statusCode).toBe(200);
    expect(mockHandle).toHaveBeenCalledTimes(2);
    expect(Logger.info as unknown as Mock).toHaveBeenCalledWith(
      'Lambda execution summary',
      expect.objectContaining({
        requestId: 'req-1',
        statusCode: 200,
        functionName: 'fn',
        functionVersion: '1',
        memoryUsed: '128',
      })
    );

    expect(Application as unknown as Mock).toHaveBeenCalledTimes(1);
    expect(Kernel as unknown as Mock).toHaveBeenCalledTimes(1);
  });

  it('handler returns 500 response on error', async () => {
    mockHandle.mockRejectedValueOnce(new Error('boom'));

    const { handler } = await import('../../../src/functions/lambda' + '?v=error');

    const res = await handler(
      { rawPath: '/health', httpMethod: 'GET' },
      {
        requestId: 'req-2',
        functionName: 'fn',
        functionVersion: '1',
        memoryLimitInMB: '128',
      }
    );

    expect(res.statusCode).toBe(500);
    expect(res.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(res.body)).toMatchObject({
      error: 'Internal Server Error',
      statusCode: 500,
    });
  });

  it('warmup returns 200 on success and 500 on failure', async () => {
    const mod = await import('../../../src/functions/lambda' + '?v=warmup');
    const { warmup } = mod;

    const ok = await warmup();
    expect(ok.statusCode).toBe(200);

    // Force failure by making Application constructor throw on a fresh module instance
    vi.resetModules();
    const { Application } = await import('@/Application');
    (Application as unknown as Mock).mockImplementationOnce(() => {
      throw new Error('init fail');
    });

    const mod2 = await import('../../../src/functions/lambda' + '?v=warmup-fail');
    const bad = await mod2.warmup();
    expect(bad.statusCode).toBe(500);
  });
});
