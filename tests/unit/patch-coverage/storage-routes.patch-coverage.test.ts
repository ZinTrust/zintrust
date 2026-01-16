import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@config/constants', () => ({ HTTP_HEADERS: { CONTENT_TYPE: 'Content-Type' } }));
vi.mock('@config/env', () => ({ Env: { get: vi.fn() } }));
vi.mock('@storage/LocalSignedUrl', () => ({ LocalSignedUrl: { verifyToken: vi.fn() } }));
vi.mock('@storage/index', () => ({ Storage: { get: vi.fn() } }));

const makeReqRes = () => {
  const calls: any = {};
  const res: any = {
    _calls: calls,
    setStatus(s: number) {
      calls.status = s;
      return res;
    },
    json(p: any) {
      calls.payload = p;
    },
    setHeader(k: string, v: string) {
      calls.headers = calls.headers || {};
      calls.headers[k] = v;
      return res;
    },
    send(c: any) {
      calls.content = c;
    },
  };
  const req: any = { getQueryParam: vi.fn() };
  return { req, res, calls };
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('patch coverage: storage routes', () => {
  it('/storage/download: returns 400 when token missing', async () => {
    const { Router } = await import('@routing/Router');
    const router = Router.createRouter();

    const { registerStorageRoutes } = await import('@/../routes/storage');
    registerStorageRoutes(router);

    const { req, res } = makeReqRes();
    req.getQueryParam.mockReturnValue('');
    await router.routes[0].handler(req, res);

    expect(res._calls.status).toBe(400);
    expect(res._calls.payload).toEqual({ message: 'Missing token' });
  });

  it('/storage/download: returns 500 when APP_KEY not configured', async () => {
    const { Env } = await import('@config/env');
    vi.mocked(Env.get as any).mockReturnValue('');

    const { Router } = await import('@routing/Router');
    const router = Router.createRouter();

    const { registerStorageRoutes } = await import('@/../routes/storage');
    registerStorageRoutes(router);

    const { req, res } = makeReqRes();
    req.getQueryParam.mockReturnValue('tok');
    await router.routes[0].handler(req, res);

    expect(res._calls.status).toBe(500);
    expect(res._calls.payload).toEqual({ message: 'Storage signing is not configured' });
  });

  it('/storage/download: returns 400 for unsupported disk', async () => {
    const { Env } = await import('@config/env');
    const { LocalSignedUrl } = await import('@storage/LocalSignedUrl');

    vi.mocked(Env.get as any).mockReturnValue('key');
    vi.mocked(LocalSignedUrl.verifyToken as any).mockReturnValue({ disk: 's3', key: 'file' });

    const { Router } = await import('@routing/Router');
    const router = Router.createRouter();

    const { registerStorageRoutes } = await import('@/../routes/storage');
    registerStorageRoutes(router);

    const { req, res } = makeReqRes();
    req.getQueryParam.mockReturnValue('tok');
    await router.routes[0].handler(req, res);

    expect(res._calls.status).toBe(400);
    expect(res._calls.payload).toEqual({ message: 'Unsupported disk' });
  });

  it('/storage/download: returns 403 for invalid token', async () => {
    const { Env } = await import('@config/env');
    const { LocalSignedUrl } = await import('@storage/LocalSignedUrl');

    vi.mocked(Env.get as any).mockReturnValue('key');
    vi.mocked(LocalSignedUrl.verifyToken as any).mockImplementation(() => {
      throw new Error('Invalid');
    });

    const { Router } = await import('@routing/Router');
    const router = Router.createRouter();

    const { registerStorageRoutes } = await import('@/../routes/storage');
    registerStorageRoutes(router);

    const { req, res } = makeReqRes();
    req.getQueryParam.mockReturnValue('tok');
    await router.routes[0].handler(req, res);

    expect(res._calls.status).toBe(403);
    expect(res._calls.payload).toEqual({ message: 'Invalid or expired token' });
  });
});
