import { JwtManager } from '@security/JwtManager';
import { TokenRevocation } from '@security/TokenRevocation';
import { Validator } from '@validation/Validator';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@config/logger', () => ({ Logger: { info: vi.fn(), error: vi.fn() } }));
vi.mock('@security/TokenRevocation', () => ({
  TokenRevocation: { isRevoked: vi.fn(), revoke: vi.fn() },
}));
vi.mock('@security/XssProtection', () => ({
  XssProtection: { escape: (s: string) => `escaped:${s}` },
}));
vi.mock('@validation/Validator', () => ({
  Validator: { validate: vi.fn() },
  Schema: { create: () => ({}) },
}));

vi.mock('@security/JwtManager', () => ({
  JwtManager: { create: () => ({ verify: vi.fn(() => ({ sub: 'u1' })) }) },
}));

const {
  authMiddleware,
  corsMiddleware,
  jsonMiddleware,
  jwtMiddleware,
  csrfMiddleware,
  validationMiddleware,
  xssProtectionMiddleware,
  loggingMiddleware,
} = await import('@app/Middleware');

const makeReqRes = () => {
  const calls: any = {};

  const res: any = {
    _calls: calls,
    setStatus(s: number) {
      calls.status = s;
      return res;
    },
    status(s: number) {
      calls.status = s;
      return { json: (p: any) => (calls.payload = p) };
    },
    json(p: any) {
      calls.payload = p;
    },
    setHeader(k: string, v: string) {
      calls.headers = calls.headers ?? {};
      calls.headers[k] = v;
    },
    getStatus() {
      return calls.status ?? 200;
    },
    send(s: string) {
      calls.sent = s;
    },
    redirect(path: string, code: number) {
      calls.redirect = { path, code };
    },
  };

  const req: any = {
    getHeader: (_: string) => undefined,
    getMethod: () => 'GET',
    getPath: () => '/',
    isJson: () => true,
    body: undefined,
    getRaw: () => ({ socket: { remoteAddress: '127.0.0.1' } }),
    sessionId: undefined,
  };

  const next = vi.fn(async () => undefined);
  return { req, res, next, calls };
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('patch coverage: Middleware', () => {
  it('authMiddleware: returns 401 when missing auth header', async () => {
    const { req, res, next } = makeReqRes();
    await authMiddleware(req, res, next);
    expect(res._calls.status).toBe(401);
    expect(res._calls.payload).toEqual({ error: 'Unauthorized' });
  });

  it('corsMiddleware: handles OPTIONS', async () => {
    const { req, res, next } = makeReqRes();
    req.getMethod = () => 'OPTIONS';
    await corsMiddleware(req, res, next);
    expect(res._calls.status).toBe(200);
    expect(res._calls.sent).toBe('');
  });

  it('jsonMiddleware: rejects non-json for POST', async () => {
    const { req, res, next } = makeReqRes();
    req.getMethod = () => 'POST';
    req.isJson = () => false;

    await jsonMiddleware(req, res, next);
    expect(res._calls.status).toBe(415);
    expect(res._calls.payload).toEqual({ error: 'Content-Type must be application/json' });
  });

  it('jwtMiddleware: missing header', async () => {
    const { req, res, next } = makeReqRes();
    const middleware = jwtMiddleware(JwtManager.create());
    await middleware(req, res, next);
    expect(res._calls.status).toBe(401);
    expect(res._calls.payload).toEqual({ error: 'Missing authorization header' });
  });

  it('jwtMiddleware: invalid format', async () => {
    const { req, res, next } = makeReqRes();
    req.getHeader = () => 'BadFormat';
    const middleware = jwtMiddleware(JwtManager.create());
    await middleware(req, res, next);
    expect(res._calls.status).toBe(401);
    expect(res._calls.payload).toEqual({ error: 'Invalid authorization header format' });
  });

  it('jwtMiddleware: revoked token', async () => {
    const { req, res, next } = makeReqRes();
    req.getHeader = () => 'Bearer tok';
    vi.mocked(TokenRevocation.isRevoked as any).mockReturnValueOnce(true);
    const middleware = jwtMiddleware(JwtManager.create());
    await middleware(req, res, next);
    expect(res._calls.status).toBe(401);
    expect(res._calls.payload).toEqual({ error: 'Invalid or expired token' });
  });

  it('jwtMiddleware: valid token sets req.user and calls next', async () => {
    const { req, res, next } = makeReqRes();
    req.getHeader = () => 'Bearer tok';
    const jwt = JwtManager.create();
    vi.mocked(jwt.verify as any).mockReturnValueOnce({ sub: 'u2' });
    const middleware = jwtMiddleware(jwt as any);
    await middleware(req, res, next);
    expect(req.user).toEqual({ sub: 'u2' });
    expect(next).toHaveBeenCalled();
  });

  it('csrfMiddleware: skips non-state-changing', async () => {
    const { req, res, next } = makeReqRes();
    req.getMethod = () => 'GET';
    const middleware = csrfMiddleware({ validateToken: () => true } as any);
    await middleware(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('csrfMiddleware: missing session id', async () => {
    const { req, res, next } = makeReqRes();
    req.getMethod = () => 'POST';
    const middleware = csrfMiddleware({ validateToken: () => true } as any);
    await middleware(req, res, next);
    expect(res._calls.status).toBe(400);
    expect(res._calls.payload).toEqual({ error: 'Missing session ID' });
  });

  it('csrfMiddleware: missing csrf token', async () => {
    const { req, res, next } = makeReqRes();
    req.getMethod = () => 'POST';
    req.sessionId = 's1';
    const middleware = csrfMiddleware({ validateToken: () => true } as any);
    await middleware(req, res, next);
    expect(res._calls.status).toBe(403);
    expect(res._calls.payload).toEqual({ error: 'Missing CSRF token' });
  });

  it('csrfMiddleware: invalid token', async () => {
    const { req, res, next } = makeReqRes();
    req.getMethod = () => 'POST';
    req.sessionId = 's1';
    req.getHeader = (h: string) => (h === 'x-csrf-token' ? 'tok' : undefined);
    const middleware = csrfMiddleware({ validateToken: () => false } as any);
    await middleware(req, res, next);
    expect(res._calls.status).toBe(403);
    expect(res._calls.payload).toEqual({ error: 'Invalid or expired CSRF token' });
  });

  it('validationMiddleware: GET skips', async () => {
    const { req, res, next } = makeReqRes();
    req.getMethod = () => 'GET';
    const middleware = validationMiddleware({ create: () => ({}) } as any);
    await middleware(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('validationMiddleware: returns 422 when toObject present', async () => {
    const vErr = { name: 'ValidationError', toObject: () => ({ a: 1 }) } as any;
    vi.mocked(Validator.validate as any).mockImplementation(() => {
      throw vErr;
    });

    const { req, res, next } = makeReqRes();
    req.getMethod = () => 'POST';
    const middleware = validationMiddleware({ create: () => ({}) } as any);
    await middleware(req, res, next);
    expect(res._calls.status).toBe(422);
    expect(res._calls.payload).toEqual({ errors: { a: 1 } });
  });

  it('validationMiddleware: returns 400 on generic error', async () => {
    vi.mocked(Validator.validate as any).mockImplementation(() => {
      throw new Error('boom');
    });

    const { req, res, next } = makeReqRes();
    req.getMethod = () => 'POST';
    const middleware = validationMiddleware({ create: () => ({}) } as any);
    await middleware(req, res, next);
    expect(res._calls.status).toBe(400);
    expect(res._calls.payload).toEqual({ error: 'Invalid request body' });
  });

  it('xssProtectionMiddleware: sets headers and escapes strings', async () => {
    const { req, res, next } = makeReqRes();
    req.body = { name: 'X' };
    await xssProtectionMiddleware(req, res, next);
    expect(res._calls.headers['X-Content-Type-Options']).toBe('nosniff');
    expect(req.body.name).toBe('escaped:X');
  });

  it('loggingMiddleware: logs request and response', async () => {
    const { req, res, next } = makeReqRes();
    req.getMethod = () => 'POST';
    req.getPath = () => '/p';
    res._calls.status = 201;
    await loggingMiddleware(req, res, next);
    // Logger.info is mocked; ensure it was called at least twice
    const { Logger } = await import('@config/logger');
    expect((Logger.info as any).mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});
