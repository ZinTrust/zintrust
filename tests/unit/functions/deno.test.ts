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

type AdapterResponse = {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
};

const mockHandle = vi.fn<(request: any) => Promise<AdapterResponse>>();
const mockFormatResponse = vi.fn<(response: AdapterResponse) => any>();
const mockStartServer = vi.fn<(port: number, host: string) => Promise<void>>();

vi.mock('@runtime/adapters/DenoAdapter', () => ({
  DenoAdapter: {
    create: vi.fn((options: { handler: (req: unknown, res: unknown) => Promise<void> }) => ({
      handle: async (request: any): Promise<AdapterResponse> => {
        await options.handler({}, {});
        return mockHandle(request);
      },
      formatResponse: mockFormatResponse,
      startServer: async (port: number, host: string): Promise<void> => {
        await options.handler({}, {});
        return mockStartServer(port, host);
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

describe('functions/deno', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHandle.mockReset();
    mockFormatResponse.mockReset();
    mockStartServer.mockReset();
  });

  it('handles fetch success and caches kernel', async () => {
    mockHandle.mockResolvedValue({
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true }),
    });

    const formatted = { status: 200 } as any;
    mockFormatResponse.mockReturnValue(formatted);

    const mod = await import('../../../src/functions/deno' + '?v=success');
    const handler = mod.default;

    const request = { url: 'https://example.com/hello', method: 'GET' } as any;

    const res1 = await handler(request);
    const res2 = await handler(request);

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

  it('starts server when called as main', async () => {
    mockFormatResponse.mockReturnValue(new Response('OK', { status: 200 }));

    const mod = await import('../../../src/functions/deno' + '?v=main');
    const handler = mod.default;

    expect(typeof handler).toBe('function');
  });
});
