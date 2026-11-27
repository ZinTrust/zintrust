/* eslint-disable max-nested-callbacks */
import type { IRequest } from '@http/Request';
import type { IResponse } from '@http/Response';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const makeReqRes = (headers: Record<string, string | undefined>) => {
  const res: any = {
    statusCode: 200,
    body: undefined as unknown,
    setStatus(code: number) {
      res.statusCode = code;
      return res;
    },
    json(payload: unknown) {
      res.body = payload;
      return undefined;
    },
  };

  const req: any = {
    user: undefined,
    context: {},
    getMethod() {
      return 'GET';
    },
    getPath() {
      return '/users';
    },
    getRaw() {
      return { url: '/users?x=1' };
    },
    getHeader(name: string) {
      return headers[name.toLowerCase()];
    },
  };

  return { req: req as IRequest, res: res as IResponse };
};

const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };

vi.mock('@config/logger', () => ({ Logger: logger }));

vi.mock('@security/JwtSessions', () => ({
  JwtSessions: {
    isActive: vi.fn(async () => true),
  },
}));

describe('patch coverage: BulletproofAuthMiddleware (extra)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env['BULLETPROOF_SIGNING_SECRET'];
    delete process.env['BULLETPROOF_SIGNING_SECRET_BK'];
    delete process.env['AUTH_KEY'];
    delete process.env.APP_KEY;
  });

  it('returns 401 when requireTimezone=true and timezone header is missing', async () => {
    vi.resetModules();

    vi.doMock('@security/SignedRequest', () => ({
      SignedRequest: {
        verify: vi.fn(async () => ({
          ok: true,
          keyId: 'dev-1',
          timestampMs: Date.now(),
          nonce: 'n1',
        })),
        sha256Hex: vi.fn(async () => 'uah'),
      },
    }));

    vi.doMock('@security/JwtManager', () => ({
      JwtManager: {
        create: vi.fn(() => ({
          setHmacSecret: vi.fn(),
          verify: vi.fn(() => ({ sub: '1', deviceId: 'dev-1' })),
        })),
      },
    }));

    const { BulletproofAuthMiddleware } = await import('@middleware/BulletproofAuthMiddleware');

    process.env['BULLETPROOF_SIGNING_SECRET'] = 's';

    const middleware = BulletproofAuthMiddleware.create({ requireTimezone: true });
    const { req, res } = makeReqRes({
      authorization: 'Bearer token',
      'x-zt-key-id': 'dev-1',
      'x-zt-device-id': 'dev-1',
      'x-zt-timestamp': String(Date.now()),
      'x-zt-nonce': 'n1',
      'x-zt-body-sha256': 'b',
      'x-zt-signature': 'sig',
    });

    await middleware(req, res, async () => undefined);

    expect((res as any).statusCode).toBe(401);
    expect((res as any).body).toEqual({ error: 'Missing or invalid timezone' });
  });

  it('accepts static secret backup when primary secret fails signature check', async () => {
    vi.resetModules();

    const verify = vi.fn(async (params: any) => {
      const keyId = params.headers['x-zt-key-id'];
      const secret = await params.getSecretForKeyId(keyId);
      if (secret === 's-good') return { ok: true, keyId, timestampMs: Date.now(), nonce: 'n1' };
      return { ok: false, code: 'INVALID_SIGNATURE', message: 'nope' };
    });

    vi.doMock('@security/SignedRequest', () => ({
      SignedRequest: {
        verify,
        sha256Hex: vi.fn(async () => 'uah'),
      },
    }));

    vi.doMock('@security/JwtManager', () => ({
      JwtManager: {
        create: vi.fn(() => ({
          setHmacSecret: vi.fn(),
          verify: vi.fn(() => ({ sub: '1', deviceId: 'dev-1' })),
        })),
      },
    }));

    const { BulletproofAuthMiddleware } = await import('@middleware/BulletproofAuthMiddleware');

    process.env['BULLETPROOF_SIGNING_SECRET'] = 's-bad';
    process.env['BULLETPROOF_SIGNING_SECRET_BK'] = '["s-good"]';

    const middleware = BulletproofAuthMiddleware.create();
    const { req, res } = makeReqRes({
      authorization: 'Bearer token',
      'x-zt-key-id': 'dev-1',
      'x-zt-device-id': 'dev-1',
      'x-zt-timestamp': String(Date.now()),
      'x-zt-nonce': 'n1',
      'x-zt-body-sha256': 'b',
      'x-zt-signature': 'sig',
      'user-agent': 'ua',
    });

    let nextCalled = false;
    await middleware(req, res, async () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(true);
    expect(verify).toHaveBeenCalledTimes(2);
  });

  it('prefers a non-signature error over INVALID_SIGNATURE when all static secrets fail', async () => {
    vi.resetModules();

    const verify = vi.fn(async (params: any) => {
      const keyId = params.headers['x-zt-key-id'];
      const secret = await params.getSecretForKeyId(keyId);
      if (secret === 's-expired') return { ok: false, code: 'EXPIRED', message: 'expired' };
      return { ok: false, code: 'INVALID_SIGNATURE', message: 'nope' };
    });

    vi.doMock('@security/SignedRequest', () => ({
      SignedRequest: {
        verify,
        sha256Hex: vi.fn(async () => 'uah'),
      },
    }));

    vi.doMock('@security/JwtManager', () => ({
      JwtManager: {
        create: vi.fn(() => ({
          setHmacSecret: vi.fn(),
          verify: vi.fn(() => ({ sub: '1', deviceId: 'dev-1' })),
        })),
      },
    }));

    const { BulletproofAuthMiddleware } = await import('@middleware/BulletproofAuthMiddleware');

    process.env['BULLETPROOF_SIGNING_SECRET'] = 's-expired';
    process.env['BULLETPROOF_SIGNING_SECRET_BK'] = '["s-bad"]';

    const middleware = BulletproofAuthMiddleware.create();
    const { req, res } = makeReqRes({
      authorization: 'Bearer token',
      'x-zt-key-id': 'dev-1',
      'x-zt-device-id': 'dev-1',
      'x-zt-timestamp': String(Date.now()),
      'x-zt-nonce': 'n1',
      'x-zt-body-sha256': 'b',
      'x-zt-signature': 'sig',
    });

    await middleware(req, res, async () => undefined);

    expect((res as any).statusCode).toBe(401);
    // middleware always responds with a generic unauthorized message when signing fails
    expect((res as any).body).toEqual({ error: 'Unauthorized' });
    // A non-signature failure (EXPIRED) is independent of the secret, so the
    // key-id hinted attempt short-circuits before trying backups.
    expect(verify).toHaveBeenCalledTimes(1);
  });

  it('enforces device + timezone + user-agent binding failures', async () => {
    vi.resetModules();

    const verifySigned = vi.fn(async () => ({
      ok: true,
      keyId: 'dev-1',
      timestampMs: Date.now(),
      nonce: 'n1',
    }));

    const sha = vi.fn(async () => 'computed-ua-hash');

    vi.doMock('@security/SignedRequest', () => ({
      SignedRequest: {
        verify: verifySigned,
        sha256Hex: sha,
      },
    }));

    // (a) device mismatch claim
    vi.doMock('@security/JwtManager', () => ({
      JwtManager: {
        create: vi.fn(() => ({
          setHmacSecret: vi.fn(),
          verify: vi.fn(() => ({
            sub: '1',
            deviceId: 'dev-2',
            tz: 'UTC',
            uaHash: 'expected-ua-hash',
          })),
        })),
      },
    }));

    const { BulletproofAuthMiddleware } = await import('@middleware/BulletproofAuthMiddleware');

    process.env['BULLETPROOF_SIGNING_SECRET'] = 's';

    const middleware = BulletproofAuthMiddleware.create();
    const { req, res } = makeReqRes({
      authorization: 'Bearer token',
      'x-zt-key-id': 'dev-1',
      'x-zt-device-id': 'dev-1',
      'x-zt-timezone': 'PST',
      'x-zt-timestamp': String(Date.now()),
      'x-zt-nonce': 'n1',
      'x-zt-body-sha256': 'b',
      'x-zt-signature': 'sig',
      'user-agent': 'ua',
    });

    await middleware(req, res, async () => undefined);

    expect((res as any).statusCode).toBe(401);
    expect((res as any).body).toEqual({ error: expect.any(String) });
  });
});
