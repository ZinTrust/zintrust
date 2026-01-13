import { beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  vi.resetAllMocks();
});

describe('CsrfMiddleware helpers and middleware behavior', () => {
  it('skips CSRF when skipPaths match', async () => {
    vi.doMock('@security/CsrfTokenManager', () => ({
      CsrfTokenManager: {
        create: () => ({ generateToken: () => 't', validateToken: () => true, cleanup: () => 0 }),
      },
    }));
    vi.doMock('@session/SessionManager', () => ({
      SessionManager: { create: () => ({ ensureSessionId: async () => 'sid' }) },
    }));

    const { CsrfMiddleware } = await import('@middleware/CsrfMiddleware');

    const mw = CsrfMiddleware.create({ skipPaths: ['/api/*', '/webhooks/hook'] });

    let next = false;
    const req: any = { getPath: () => '/api/foo' };
    const res: any = {};

    await mw(req, res, async () => {
      next = true;
    });

    expect(next).toBe(true);
  });

  it('GET sets cookie and locals', async () => {
    vi.resetModules();
    const token = 'tok1';

    vi.doMock('@security/CsrfTokenManager', () => ({
      CsrfTokenManager: {
        create: () => ({ generateToken: () => token, validateToken: () => true, cleanup: () => 0 }),
      },
    }));

    vi.doMock('@session/SessionManager', () => ({
      SessionManager: { create: () => ({ ensureSessionId: async () => 'sid' }) },
    }));

    const { CsrfMiddleware } = await import('@middleware/CsrfMiddleware');

    const mw = CsrfMiddleware.create();

    const req: any = {
      getHeader: () => undefined,
      getMethod: () => 'GET',
      context: {},
      getPath: () => '/',
    };
    const headers: Record<string, string | string[]> = {};
    const res: any = {
      getHeader: (name: string) => headers[name],
      setHeader: (name: string, value: string | string[]) => (headers[name] = value),
      locals: {},
    };

    let called = false;
    await mw(req, res, async () => {
      called = true;
    });

    expect(called).toBe(true);
    expect(res.locals['csrfToken']).toBe(token);
    expect(typeof headers['Set-Cookie']).toBe('string');
  });

  it('POST without valid token returns 403', async () => {
    vi.resetModules();
    vi.doMock('@security/CsrfTokenManager', () => ({
      CsrfTokenManager: {
        create: () => ({
          generateToken: () => 't',
          validateToken: () => false,
          cleanup: () => 0,
        }),
      },
    }));

    vi.doMock('@session/SessionManager', () => ({
      SessionManager: { create: () => ({ ensureSessionId: async () => 'sid' }) },
    }));

    const { CsrfMiddleware } = await import('@middleware/CsrfMiddleware');
    const mw = CsrfMiddleware.create();

    const req: any = {
      getHeader: (_n: string) => undefined,
      getMethod: () => 'POST',
      getPath: () => '/',
      getBody: () => ({}),
    };
    const res: any = {
      setStatus: (s: number) => {
        res.status = s;
      },
      json: (p: any) => (res.payload = p),
    };

    let nextCalled = false;
    await mw(req, res, async () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(false);
    expect(res.payload).toEqual({ error: 'Forbidden', message: 'Invalid CSRF token' });
  });

  it('POST with valid token in header proceeds', async () => {
    vi.resetModules();
    vi.doMock('@security/CsrfTokenManager', () => ({
      CsrfTokenManager: {
        create: () => ({ generateToken: () => 't', validateToken: () => true, cleanup: () => 0 }),
      },
    }));

    vi.doMock('@session/SessionManager', () => ({
      SessionManager: { create: () => ({ ensureSessionId: async () => 'sid' }) },
    }));

    const { CsrfMiddleware } = await import('@middleware/CsrfMiddleware');
    const mw = CsrfMiddleware.create();

    const req: any = {
      getHeader: (n: string) => (n === 'X-CSRF-Token' ? 't' : undefined),
      getMethod: () => 'POST',
      getPath: () => '/',
      getBody: () => ({}),
    };
    const res: any = {
      setStatus: (s: number) => {
        res.status = s;
      },
      json: (p: any) => (res.payload = p),
      locals: {},
    };

    let proceeded = false;
    await mw(req, res, async () => {
      proceeded = true;
    });

    expect(proceeded).toBe(true);
  });

  it('cookie parsing via header works in middleware', async () => {
    vi.resetModules();
    vi.doMock('@security/CsrfTokenManager', () => ({
      CsrfTokenManager: {
        create: () => ({
          generateToken: () => 't',
          validateToken: (_s: string, tok: string) => tok === 't',
          cleanup: () => 0,
        }),
      },
    }));
    vi.doMock('@session/SessionManager', () => ({
      SessionManager: { create: () => ({ ensureSessionId: async () => 'sid' }) },
    }));

    const { CsrfMiddleware } = await import('@middleware/CsrfMiddleware');
    const mw = CsrfMiddleware.create();

    const req: any = {
      getHeader: (n: string) => (n === 'cookie' ? 'XSRF-TOKEN=t; b=hello%20world' : undefined),
      getMethod: () => 'POST',
      getPath: () => '/',
      getBody: () => ({}),
    };
    const res: any = {
      setStatus: (s: number) => {
        res.status = s;
      },
      json: (p: any) => (res.payload = p),
    };

    let nextCalled = false;
    await mw(req, res, async () => {
      nextCalled = true;
    });

    // With valid token logic this should proceed
    expect(nextCalled).toBe(true);
  });
});
