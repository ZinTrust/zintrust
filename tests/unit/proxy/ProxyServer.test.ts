import { describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  createServer: vi.fn(),
}));

vi.mock('@node-singletons/http', async (importOriginal) => {
  const original = (await importOriginal()) as Record<string, unknown>;
  return {
    ...original,
    createServer: (...args: any[]) => mocked.createServer(...args),
  };
});

describe('createProxyServer', () => {
  it('serves /health and forwards normal requests (with verify)', async () => {
    const handlerRef: { handler?: any } = {};
    const server = {
      listen: vi.fn((_port: number, _host: string, cb: any) => cb()),
      close: vi.fn((cb: any) => cb()),
    };
    mocked.createServer.mockImplementation((handler: any) => {
      handlerRef.handler = handler;
      return server as any;
    });

    const backend = {
      health: vi.fn(async () => ({ status: 200, body: { ok: true }, headers: { 'x-a': 'b' } })),
      handle: vi.fn(async () => ({ status: 200, body: { ok: true } })),
    };

    const verify = vi.fn(async (_req: any, _body: string) => ({ ok: true as const }));

    const { createProxyServer } = await import('@proxy/ProxyServer');
    const proxy = createProxyServer({
      host: '127.0.0.1',
      port: 0,
      maxBodyBytes: 10_000,
      backend,
      verify,
    });

    await proxy.start();

    const makeReq = (input: { url: string; method?: string; body: string; headers?: any }) => {
      const chunks = [Buffer.from(input.body)];
      return {
        url: input.url,
        method: input.method ?? 'POST',
        headers: input.headers ?? { host: 'localhost' },
        async *[Symbol.asyncIterator]() {
          for (const c of chunks) yield c;
        },
      } as any;
    };

    const res = {
      writeHead: vi.fn(),
      end: vi.fn(),
    } as any;

    await handlerRef.handler(makeReq({ url: '/health', body: '' }), res);
    expect(backend.health).toHaveBeenCalledTimes(1);
    expect(res.writeHead).toHaveBeenCalledWith(
      200,
      expect.objectContaining({ 'Content-Type': expect.any(String), 'x-a': 'b' })
    );

    await handlerRef.handler(
      makeReq({
        url: '/api',
        method: 'PUT',
        body: '{"x":1}',
        headers: { host: 'example.com', 'content-type': ['application/json'] },
      }),
      res
    );
    expect(verify).toHaveBeenCalledTimes(1);
    expect(backend.handle).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'PUT', path: '/api', body: '{"x":1}' })
    );

    await proxy.stop();
  });

  it('returns UNAUTHORIZED when verify fails and returns PROXY_ERROR on exceptions', async () => {
    const handlerRef: { handler?: any } = {};
    mocked.createServer.mockImplementation((handler: any) => {
      handlerRef.handler = handler;
      return {
        listen: vi.fn((_p: any, _h: any, cb: any) => cb()),
        close: vi.fn((cb: any) => cb()),
      } as any;
    });

    const backend = {
      health: vi.fn(async () => ({ status: 200, body: { ok: true } })),
      handle: vi.fn(async () => {
        throw new Error('boom');
      }),
    };

    const verify = vi.fn(async () => ({ ok: false as const, status: 401, message: 'nope' }));

    const { createProxyServer } = await import('@proxy/ProxyServer');
    const proxy = createProxyServer({
      host: '127.0.0.1',
      port: 0,
      maxBodyBytes: 5,
      backend,
      verify,
    });
    await proxy.start();

    const reqOk: any = {
      url: '/api',
      method: 'POST',
      headers: { host: 'localhost' },
      async *[Symbol.asyncIterator]() {
        yield Buffer.from('{}');
      },
    };
    const res = { writeHead: vi.fn(), end: vi.fn() } as any;

    await handlerRef.handler(reqOk, res);
    expect(backend.handle).not.toHaveBeenCalled();
    expect(res.end).toHaveBeenCalledWith(expect.stringContaining('UNAUTHORIZED'));

    const reqTooBig: any = {
      url: '/api',
      method: 'POST',
      headers: { host: 'localhost' },
      async *[Symbol.asyncIterator]() {
        yield Buffer.from('123456');
      },
    };

    await handlerRef.handler(reqTooBig, res);
    expect(res.end).toHaveBeenCalledWith(expect.stringContaining('PROXY_ERROR'));

    // verify ok but backend throws -> PROXY_ERROR
    verify.mockResolvedValueOnce({ ok: true as const });
    await handlerRef.handler(reqOk, res);
    expect(res.end).toHaveBeenCalledWith(expect.stringContaining('PROXY_ERROR'));

    await proxy.stop();
  });
});
