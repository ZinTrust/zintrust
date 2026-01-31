import { HTTP_HEADERS } from '@/config/constants';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('Server security headers', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('sets Content-Security-Policy for HTML responses', async () => {
    const mockKernel = { handleRequest: vi.fn().mockResolvedValue(undefined) } as any;

    // Minimal app mock
    const app = {
      getRouter: () => ({}) as any,
      getContainer: () => ({}) as any,
    } as any;

    const { Server } = await import('@/boot/Server');

    const server = Server.create(app, 0, '127.0.0.1', mockKernel);
    const httpServer = server.getHttpServer();

    const req = { headers: { 'content-type': 'text/html' } } as any;
    const setHeader = vi.fn();
    const res = { setHeader } as any;

    // Emit a request event to trigger the handler
    httpServer.emit('request', req, res);

    // Give the event loop a tick for async handler
    await new Promise((r) => setImmediate(r));

    expect(setHeader).toHaveBeenCalledWith(
      HTTP_HEADERS.CONTENT_SECURITY_POLICY,
      expect.any(String)
    );
  });
});
