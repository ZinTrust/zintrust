import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const handleMock = vi.fn();
const formatResponseMock = vi.fn();
const getRuntimeMock = vi.hoisted(() => vi.fn());

vi.mock('@runtime/adapters/CloudflareAdapter', () => ({
  CloudflareAdapter: {
    create: vi.fn(() => ({
      handle: handleMock,
      formatResponse: formatResponseMock,
    })),
  },
}));

vi.mock('@runtime/getKernel', () => ({
  getKernel: vi.fn(async () => ({
    handle: vi.fn(async () => undefined),
  })),
}));

vi.mock('@runtime/WorkerAdapterImports', () => ({
  WorkerAdapterImports: {
    ready: Promise.resolve(),
  },
}));

vi.mock('@runtime/ProjectRuntime', () => ({
  ProjectRuntime: {
    tryLoadWorkerRuntime: vi.fn(async () => undefined),
    getActiveService: vi.fn(() => undefined),
  },
}));

vi.mock('@sockets/SocketRuntimeRegistry', () => ({
  SocketRuntimeRegistry: {
    getRuntime: getRuntimeMock,
  },
}));

describe('functions/cloudflare socket intercept', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getRuntimeMock.mockReset();
    delete (globalThis as { env?: unknown }).env;
  });

  afterEach(() => {
    vi.resetModules();
    delete (globalThis as { env?: unknown }).env;
  });

  it('returns the socket runtime response before invoking the HTTP adapter', async () => {
    const socketResponse = new Response('socket-runtime', { status: 200 });
    getRuntimeMock.mockReturnValue({
      isEnabled: () => true,
      canHandleWorkerRequest: () => true,
      handleWorkerRequest: vi.fn(async () => socketResponse),
    });

    const mod = await import('../../../src/functions/cloudflare?socket-intercept');
    const result = await mod.default.fetch(
      new Request('https://example.test/app/demo-key', {
        headers: { upgrade: 'websocket' },
      }),
      {},
      {}
    );

    expect(result).toBe(socketResponse);
    expect(handleMock).not.toHaveBeenCalled();
    expect(formatResponseMock).not.toHaveBeenCalled();
  });

  it('re-exports the socket durable object from the worker entrypoint', async () => {
    getRuntimeMock.mockReturnValue(undefined);

    const mod = await import('../../../src/functions/cloudflare?socket-durable-object-export');

    expect(mod.ZintrustSocketHub).toBeTypeOf('function');
  });
});
