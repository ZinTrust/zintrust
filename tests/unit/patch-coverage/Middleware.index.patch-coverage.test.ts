import { describe, expect, it, vi } from 'vitest';

// Mock TokenRevocation before importing the middleware module
vi.mock('@security/TokenRevocation', () => ({
  TokenRevocation: {
    isRevoked: vi.fn(),
  },
}));

import {
  authMiddleware,
  corsMiddleware,
  jsonMiddleware,
  jwtMiddleware,
  trailingSlashMiddleware,
} from '../../../app/Middleware/index';

import { TokenRevocation } from '@security/TokenRevocation';

const makeReqRes = (overrides: any = {}) => {
  const req: any = {
    getHeader: (key: string) => (overrides.headers || {})[key],
    getMethod: () => overrides.method ?? 'GET',
    getPath: () => overrides.path ?? '/',
    isJson: () => overrides.isJson ?? true,
    body: overrides.body,
    sessionId: overrides.sessionId,
    getRaw: () => ({ socket: { remoteAddress: '1.2.3.4' } }),
  };

  const res: any = {
    _status: 200,
    _json: undefined,
    _sent: undefined,
    _redirect: undefined,
    setStatus(code: number) {
      this._status = code;
      return this;
    },
    getStatus() {
      return this._status;
    },
    json(obj: any) {
      this._json = obj;
      return this;
    },
    send(val: any) {
      this._sent = val;
      return this;
    },
    setHeader() {
      return this;
    },
    redirect(url: string, code: number) {
      this._redirect = { url, code };
      return this;
    },
  };

  const next = vi.fn(async () => {});

  return { req, res, next };
};

describe('Middleware index quick patch coverage', () => {
  it('authMiddleware returns 401 when missing authorization', async () => {
    const { req, res, next } = makeReqRes();
    await authMiddleware(req, res, next);
    expect(res._status).toBe(401);
    expect(res._json).toEqual({ error: 'Unauthorized' });
    expect(next).not.toHaveBeenCalled();
  });

  it('corsMiddleware handles OPTIONS with 200 send', async () => {
    const { req, res, next } = makeReqRes({ method: 'OPTIONS' });
    await corsMiddleware(req, res, next);
    expect(res._status).toBe(200);
    expect(res._sent).toBe('');
    expect(next).not.toHaveBeenCalled();
  });

  it('jsonMiddleware rejects non-json POST requests', async () => {
    const { req, res, next } = makeReqRes({ method: 'POST', isJson: false });
    await jsonMiddleware(req, res, next);
    expect(res._status).toBe(415);
    expect(res._json).toEqual({ error: 'Content-Type must be application/json' });
    expect(next).not.toHaveBeenCalled();
  });

  it('trailingSlashMiddleware redirects trailing slash', async () => {
    const { req, res, next } = makeReqRes({ path: '/foo/' });
    await trailingSlashMiddleware(req, res, next);
    expect(res._redirect).toEqual({ url: '/foo', code: 301 });
    expect(next).not.toHaveBeenCalled();
  });

  it('jwtMiddleware returns 401 when token is revoked', async () => {
    (TokenRevocation as any).isRevoked.mockReturnValue(true);
    const { req, res, next } = makeReqRes({ headers: { authorization: 'Bearer tok' } });
    const jw = jwtMiddleware({
      setHmacSecret: () => {},
      setRsaKeys: () => {},
      sign: () => '',
      verify: () => ({}),
      decode: () => ({}),
      signRsa: () => '',
      generateJwtId: () => '',
    });
    await jw(req, res, next);
    expect(res._status).toBe(401);
    expect(res._json).toEqual({ error: 'Invalid or expired token' });
    expect(next).not.toHaveBeenCalled();
  });

  it('jwtMiddleware verifies token and sets req.user on success', async () => {
    (TokenRevocation as any).isRevoked.mockReturnValue(false);
    const jwManager = {
      setHmacSecret: vi.fn(),
      setRsaKeys: vi.fn(),
      sign: vi.fn(() => ''),
      verify: vi.fn(() => ({ sub: 'user:1' })),
      decode: vi.fn(() => ({ sub: 'user:1' })),
      signRsa: vi.fn(() => ''),
      generateJwtId: vi.fn(() => 'id'),
    };
    const { req, res, next } = makeReqRes({ headers: { authorization: 'Bearer tok' } });
    const jw = jwtMiddleware(jwManager);
    await jw(req, res, next);
    expect(req.user).toEqual({ sub: 'user:1' });
    expect(next).toHaveBeenCalled();
  });
});
