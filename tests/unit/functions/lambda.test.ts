import { createGeneralError } from '@exceptions/ZintrustError';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

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

type PlatformResponse = {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
};

const mockHandle =
  vi.fn<(event: unknown, context: { requestId: string }) => Promise<PlatformResponse>>();

vi.mock('@runtime/adapters/LambdaAdapter', () => ({
  LambdaAdapter: {
    create: vi.fn((options: { handler: (req: unknown, res: unknown) => Promise<void> }) => ({
      handle: async (event: unknown, context: { requestId: string }): Promise<PlatformResponse> => {
        await options.handler({}, {});
        return mockHandle(event, context);
      },
    })),
  },
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
    mockHandle.mockReset();
  });

  it('handles lambda event success and caches kernel', async () => {
    mockHandle.mockResolvedValue({
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true }),
    });

    const mod = await import('../../../src/functions/lambda' + '?v=success');
    const handler = mod.handler;

    const event = { path: '/hello', httpMethod: 'GET' };
    const context = { requestId: 'req-1' };

    const res1 = await handler(event, context);
    const res2 = await handler(event, context);

    const { Logger } = await import('@config/logger');
    if (res1.statusCode !== 200 || res2.statusCode !== 200) {
      const calls = (Logger.error as unknown as Mock).mock.calls;
      const lastError = calls.at(-1)?.[1] as unknown;
      const message = lastError instanceof Error ? lastError.message : JSON.stringify(lastError);
      throw createGeneralError(
        `Expected success responses; got ${res1.statusCode}/${res2.statusCode}. Logged error: ${message}`
      );
    }

    expect(res1.statusCode).toBe(200);
    expect(res2.statusCode).toBe(200);
    expect(Logger.error as unknown as Mock).not.toHaveBeenCalled();

    const { Application } = await import('@boot/Application');
    const { Kernel } = await import('@http/Kernel');

    expect(Application.create as unknown as Mock).toHaveBeenCalledTimes(1);
    expect(Kernel.create as unknown as Mock).toHaveBeenCalledTimes(1);
    expect(mockHandle).toHaveBeenCalledTimes(2);
  });

  it('returns 500 response on lambda error', async () => {
    mockHandle.mockRejectedValueOnce(createGeneralError('boom'));

    const mod = await import('@functions/lambda' + '?v=error');
    const handler = mod.handler;

    const event = { path: '/hello', httpMethod: 'GET' };
    const context = { requestId: 'req-2' };

    const response = await handler(event, context);
    expect(response.statusCode).toBe(500);

    const body = JSON.parse(response.body);
    expect(body).toMatchObject({
      message: 'Internal Server Error',
    });
  });
});
