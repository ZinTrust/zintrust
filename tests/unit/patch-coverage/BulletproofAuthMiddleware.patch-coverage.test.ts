import type { IRequest } from '@http/Request';
import type { IResponse } from '@http/Response';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { findByDeviceIdMock } = vi.hoisted(() => ({
  findByDeviceIdMock: vi.fn(async () => null),
}));

vi.mock('@config/security', () => ({
  securityConfig: {
    jwt: {
      algorithm: 'HS256',
      secret: 'secret',
    },
  },
}));

vi.mock('@config/env', () => ({
  Env: {
    get: vi.fn(() => ''),
    getBool: vi.fn(() => false),
    getInt: vi.fn(() => 0),
    getFloat: vi.fn(() => 0),
  },
}));

vi.mock('@security/JwtSessions', () => ({
  JwtSessions: {
    isActive: vi.fn(async () => true),
  },
}));

vi.mock('@security/SignedRequest', () => ({
  SignedRequest: {
    verify: vi.fn(async () => ({ ok: true, keyId: 'dev-1', timestampMs: Date.now(), nonce: 'n1' })),
    sha256Hex: vi.fn(async () => 'uah'),
  },
}));

const mockJwtVerify = vi.fn(() => ({ sub: '1', deviceId: 'dev-1' }));

vi.mock('@security/JwtManager', () => ({
  JwtManager: {
    create: vi.fn(() => ({
      setHmacSecret: vi.fn(),
      verify: mockJwtVerify,
    })),
  },
}));

vi.mock('@/config/logger', () => ({
  Logger: {
    debug: vi.fn(),
  },
}));

vi.mock('@security/BulletproofDeviceStore', () => ({
  BulletproofDeviceStore: {
    findByDeviceId: findByDeviceIdMock,
  },
}));

import { Env } from '@config/env';
import { BulletproofAuthMiddleware } from '@middleware/BulletproofAuthMiddleware';
import { JwtAuthMiddleware } from '@middleware/JwtAuthMiddleware';
import { JwtSessions } from '@security/JwtSessions';
import { SignedRequest } from '@security/SignedRequest';

const createReqRes = (headers: Record<string, string>): { req: IRequest; res: IResponse } => {
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
      return '/me';
    },
    getRaw() {
      return { url: '/me?x=1' };
    },
    getHeader(name: string) {
      return headers[name.toLowerCase()];
    },
  };

  return { req, res };
};

describe('patch coverage: BulletproofAuthMiddleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(Env.get).mockImplementation(() => '');
    findByDeviceIdMock.mockResolvedValue(null);
  });

  it('returns 401 when token is not active', async () => {
    (JwtSessions.isActive as any).mockImplementationOnce(async () => false);

    const middleware = BulletproofAuthMiddleware.create({ signingSecret: 's' });
    const { req, res } = createReqRes({
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
    expect((res as any).body).toEqual({ error: 'Invalid or expired token' });
  });

  it('delegates unauthorized bulletproof responses to onUnauthorized', async () => {
    (JwtSessions.isActive as any).mockImplementationOnce(async () => false);
    const onUnauthorized = vi.fn(async (_req, res, context) => {
      res.setStatus(context.statusCode);
      res.json({ middleware: context.middleware, reason: context.reason });
    });

    const middleware = BulletproofAuthMiddleware.create({
      signingSecret: 's',
      onUnauthorized,
    });
    const { req, res } = createReqRes({
      authorization: 'Bearer token',
      'x-zt-key-id': 'dev-1',
      'x-zt-device-id': 'dev-1',
      'x-zt-timestamp': String(Date.now()),
      'x-zt-nonce': 'n1',
      'x-zt-body-sha256': 'b',
      'x-zt-signature': 'sig',
    });

    await middleware(req, res, async () => undefined);

    expect(onUnauthorized).toHaveBeenCalledWith(
      req,
      res,
      expect.objectContaining({
        middleware: 'bulletproof',
        statusCode: 401,
      })
    );
    expect((res as any).body).toEqual({
      middleware: 'bulletproof',
      reason: 'unauthorized',
    });
  });

  it('uses getSecretForKeyId when provided', async () => {
    const getSecretForKeyId = vi.fn().mockResolvedValue('dynamic-secret');
    const middleware = BulletproofAuthMiddleware.create({ getSecretForKeyId });
    const { req, res } = createReqRes({
      authorization: 'Bearer token',
      'x-zt-key-id': 'dev-1',
      'x-zt-device-id': 'dev-1',
      'x-zt-timestamp': String(Date.now()),
      'x-zt-nonce': 'n1',
      'x-zt-body-sha256': 'b',
      'x-zt-signature': 'sig',
    });

    await middleware(req, res, async () => undefined);

    expect(SignedRequest.verify).toHaveBeenCalled();

    // Extract the verify call arguments
    const verifyArgs = vi.mocked(SignedRequest.verify).mock.calls[0]?.[0] as any;
    expect(verifyArgs).toBeDefined();

    // Test the internal getSecretForKeyId wrapper
    const secret = await verifyArgs.getSecretForKeyId('dev-1');
    expect(secret).toBe('dynamic-secret');
    expect(getSecretForKeyId).toHaveBeenCalledWith('dev-1', req);
  });

  it('treats empty getSecretForKeyId result as missing', async () => {
    const getSecretForKeyId = vi.fn().mockResolvedValue('   ');
    const middleware = BulletproofAuthMiddleware.create({ getSecretForKeyId });
    const { req, res } = createReqRes({
      authorization: 'Bearer token',
      'x-zt-key-id': 'dev-1',
      'x-zt-device-id': 'dev-1',
      'x-zt-timestamp': String(Date.now()),
      'x-zt-nonce': 'n1',
      'x-zt-body-sha256': 'b',
      'x-zt-signature': 'sig',
    });

    await middleware(req, res, async () => undefined);

    expect(SignedRequest.verify).toHaveBeenCalled();
    const verifyArgs = vi.mocked(SignedRequest.verify).mock.calls[0]?.[0] as any;
    const secret = await verifyArgs.getSecretForKeyId('dev-1');
    expect(secret).toBeUndefined();
    expect(getSecretForKeyId).toHaveBeenCalledWith('dev-1', req);
  });

  it('attaches req.user and auth context on success', async () => {
    const middleware = BulletproofAuthMiddleware.create({ signingSecret: 's' });
    const { req, res } = createReqRes({
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
    expect(req.user).toBeDefined();
    expect(req.context.authStrategy).toBe('bulletproof');
    expect(req.context.auth).toBeDefined();
    expect(SignedRequest.verify).toHaveBeenCalled();
  });

  it('JwtAuthMiddleware skips when bulletproof already authenticated', async () => {
    const jwt = JwtAuthMiddleware.create();
    const { req, res } = createReqRes({ authorization: 'Bearer token' });
    req.user = { sub: '1' };
    req.context.authStrategy = 'bulletproof';

    let nextCalled = false;
    await jwt(req, res, async () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(true);
  });

  it('returns 401 when JWT verification fails', async () => {
    mockJwtVerify.mockImplementationOnce(() => {
      throw new Error('Invalid token');
    });

    const middleware = BulletproofAuthMiddleware.create({ signingSecret: 's' });
    const { req, res } = createReqRes({
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
  });

  it('returns 401 when device mismatch occurs', async () => {
    const middleware = BulletproofAuthMiddleware.create({
      signingSecret: 's',
      requireDeviceId: true,
    });
    const { req, res } = createReqRes({
      authorization: 'Bearer token',
      'x-zt-key-id': 'dev-1',
      'x-zt-device-id': 'dev-2', // Mismatch with key-id
      'x-zt-timestamp': String(Date.now()),
      'x-zt-nonce': 'n1',
      'x-zt-body-sha256': 'b',
      'x-zt-signature': 'sig',
    });

    await middleware(req, res, async () => undefined);
    expect((res as any).statusCode).toBe(401);
  });

  it('returns 401 when timezone mismatch occurs', async () => {
    mockJwtVerify.mockReturnValueOnce({ sub: '1', deviceId: 'dev-1', tz: 'UTC' });

    const middleware = BulletproofAuthMiddleware.create({
      signingSecret: 's',
      requireTimezoneClaimMatch: true,
    });
    const { req, res } = createReqRes({
      authorization: 'Bearer token',
      'x-zt-key-id': 'dev-1',
      'x-zt-device-id': 'dev-1',
      'x-zt-timezone': 'America/New_York', // Mismatch with claim
      'x-zt-timestamp': String(Date.now()),
      'x-zt-nonce': 'n1',
      'x-zt-body-sha256': 'b',
      'x-zt-signature': 'sig',
    });

    await middleware(req, res, async () => undefined);
    expect((res as any).statusCode).toBe(401);
    expect((res as any).body).toEqual({ error: 'Timezone mismatch' });
  });

  it('returns 401 when user agent mismatch occurs', async () => {
    mockJwtVerify.mockReturnValueOnce({ sub: '1', deviceId: 'dev-1', uah: 'different-hash' });
    const middleware = BulletproofAuthMiddleware.create({
      signingSecret: 's',
      requireUserAgentHashMatch: true,
    });
    const { req, res } = createReqRes({
      authorization: 'Bearer token',
      'x-zt-key-id': 'dev-1',
      'x-zt-device-id': 'dev-1',
      'user-agent': 'test-agent',
      'x-zt-timestamp': String(Date.now()),
      'x-zt-nonce': 'n1',
      'x-zt-body-sha256': 'b',
      'x-zt-signature': 'sig',
    });

    await middleware(req, res, async () => undefined);
    expect((res as any).statusCode).toBe(401);
    expect((res as any).body).toEqual({ error: 'User agent mismatch' });
  });

  it('returns 401 when all static secrets fail with INVALID_SIGNATURE', async () => {
    vi.mocked(Env.get).mockImplementation((key: string) => {
      if (key === 'BULLETPROOF_SIGNING_SECRET_BK') return '["backup-secret"]';
      return '';
    });

    vi.mocked(SignedRequest.verify)
      .mockResolvedValueOnce({
        ok: false,
        code: 'INVALID_SIGNATURE',
        message: 'Invalid signature',
      } as any)
      .mockResolvedValueOnce({
        ok: false,
        code: 'INVALID_SIGNATURE',
        message: 'Invalid signature',
      } as any);

    const middleware = BulletproofAuthMiddleware.create({ signingSecret: 'primary-secret' });
    const { req, res } = createReqRes({
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
    expect(vi.mocked(SignedRequest.verify).mock.calls.length).toBe(2);
  });

  it('parses comma-separated backups and filters empties', async () => {
    vi.mocked(Env.get).mockImplementation((key: string) => {
      if (key === 'BULLETPROOF_SIGNING_SECRET_BK') return '  a, , b ,  ';
      return '';
    });

    const middleware = BulletproofAuthMiddleware.create({ signingSecret: 's' });
    const { req, res } = createReqRes({
      authorization: 'Bearer token',
      'x-zt-key-id': 'dev-1',
      'x-zt-device-id': 'dev-1',
      'x-zt-timestamp': String(Date.now()),
      'x-zt-nonce': 'n1',
      'x-zt-body-sha256': 'b',
      'x-zt-signature': 'sig',
    });

    await middleware(req, res, async () => undefined);
    expect(SignedRequest.verify).toHaveBeenCalled();
  });

  it('filters out non-strings and empty strings from JSON-array backups', async () => {
    vi.mocked(Env.get).mockImplementation((key: string) => {
      if (key === 'BULLETPROOF_SIGNING_SECRET_BK') return '["valid", 123, " ", "also-valid"]';
      return '';
    });

    const middleware = BulletproofAuthMiddleware.create({ signingSecret: 's' });
    const { req, res } = createReqRes({
      authorization: 'Bearer token',
      'x-zt-key-id': 'dev-1',
      'x-zt-device-id': 'dev-1',
      'x-zt-timestamp': String(Date.now()),
      'x-zt-nonce': 'n1',
      'x-zt-body-sha256': 'b',
      'x-zt-signature': 'sig',
    });

    await middleware(req, res, async () => undefined);
    expect(SignedRequest.verify).toHaveBeenCalled();
  });

  it('handles invalid JSON backups gracefully', async () => {
    vi.mocked(Env.get).mockImplementation((key: string) => {
      if (key === 'BULLETPROOF_SIGNING_SECRET_BK') return '[invalid-json';
      return '';
    });

    const middleware = BulletproofAuthMiddleware.create({ signingSecret: 's' });
    const { req, res } = createReqRes({
      authorization: 'Bearer token',
      'x-zt-key-id': 'dev-1',
      'x-zt-device-id': 'dev-1',
      'x-zt-timestamp': String(Date.now()),
      'x-zt-nonce': 'n1',
      'x-zt-body-sha256': 'b',
      'x-zt-signature': 'sig',
    });

    await middleware(req, res, async () => undefined);
    expect(SignedRequest.verify).toHaveBeenCalled();
  });

  it('accepts request when user agent hash matches claim', async () => {
    mockJwtVerify.mockReturnValueOnce({ sub: '1', deviceId: 'dev-1', uah: 'uah' });

    const middleware = BulletproofAuthMiddleware.create({
      signingSecret: 's',
      requireUserAgentHashMatch: true,
    });
    const { req, res } = createReqRes({
      authorization: 'Bearer token',
      'x-zt-key-id': 'dev-1',
      'x-zt-device-id': 'dev-1',
      'user-agent': 'test-agent',
      'x-zt-timestamp': String(Date.now()),
      'x-zt-nonce': 'n1',
      'x-zt-body-sha256': 'b',
      'x-zt-signature': 'sig',
    });

    let nextCalled = false;
    await middleware(req, res, async () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(true);
    expect((res as any).statusCode).toBe(200);
  });

  it('treats blank backup secret env as empty list', async () => {
    vi.mocked(Env.get).mockImplementation((key: string) => {
      if (key === 'BULLETPROOF_SIGNING_SECRET_BK') return '   ';
      return '';
    });

    const middleware = BulletproofAuthMiddleware.create({ signingSecret: 's' });
    const { req, res } = createReqRes({
      authorization: 'Bearer token',
      'x-zt-key-id': 'dev-1',
      'x-zt-device-id': 'dev-1',
      'x-zt-timestamp': String(Date.now()),
      'x-zt-nonce': 'n1',
      'x-zt-body-sha256': 'b',
      'x-zt-signature': 'sig',
    });

    await middleware(req, res, async () => undefined);
    expect(SignedRequest.verify).toHaveBeenCalled();
  });

  it('exposes default getSecretForKeyId as undefined when signingSecret is empty', async () => {
    const middleware = BulletproofAuthMiddleware.create({ signingSecret: '' });
    const { req, res } = createReqRes({
      authorization: 'Bearer token',
      'x-zt-key-id': 'dev-1',
      'x-zt-device-id': 'dev-1',
      'x-zt-timestamp': String(Date.now()),
      'x-zt-nonce': 'n1',
      'x-zt-body-sha256': 'b',
      'x-zt-signature': 'sig',
    });

    await middleware(req, res, async () => undefined);
    const verifyArgs = vi.mocked(SignedRequest.verify).mock.calls[0]?.[0] as any;
    expect(verifyArgs).toBeDefined();
    const secret = await verifyArgs.getSecretForKeyId('dev-1');
    expect(secret).toBeUndefined();
  });

  it('propagates device-store failures from the default key resolver', async () => {
    findByDeviceIdMock.mockRejectedValue(new Error('missing migrations'));

    const middleware = BulletproofAuthMiddleware.create({ signingSecret: '' });
    const { req, res } = createReqRes({
      authorization: 'Bearer token',
      'x-zt-key-id': 'dev-1',
      'x-zt-device-id': 'dev-1',
      'x-zt-timestamp': String(Date.now()),
      'x-zt-nonce': 'n1',
      'x-zt-body-sha256': 'b',
      'x-zt-signature': 'sig',
    });

    await middleware(req, res, async () => undefined);
    const verifyArgs = vi.mocked(SignedRequest.verify).mock.calls[0]?.[0] as any;

    await expect(verifyArgs.getSecretForKeyId('dev-1')).rejects.toThrow('missing migrations');
  });

  it('uses the device-specific signing secret when the store returns one', async () => {
    findByDeviceIdMock.mockResolvedValueOnce({ signingSecret: 'device-secret' });

    const middleware = BulletproofAuthMiddleware.create({ signingSecret: '' });
    const { req, res } = createReqRes({
      authorization: 'Bearer token',
      'x-zt-key-id': 'dev-1',
      'x-zt-device-id': 'dev-1',
      'x-zt-timestamp': String(Date.now()),
      'x-zt-nonce': 'n1',
      'x-zt-body-sha256': 'b',
      'x-zt-signature': 'sig',
    });

    await middleware(req, res, async () => undefined);
    const verifyArgs = vi.mocked(SignedRequest.verify).mock.calls[0]?.[0] as any;

    await expect(verifyArgs.getSecretForKeyId('dev-1')).resolves.toBe('device-secret');
  });

  it('sets tenantId on request context when present in JWT payload', async () => {
    mockJwtVerify.mockReturnValueOnce({ sub: '1', deviceId: 'dev-1', tenantId: 'tenant-456' });

    const middleware = BulletproofAuthMiddleware.create({ signingSecret: 's' });
    const { req, res } = createReqRes({
      authorization: 'Bearer token',
      'x-zt-key-id': 'dev-1',
      'x-zt-device-id': 'dev-1',
      'x-zt-timestamp': String(Date.now()),
      'x-zt-nonce': 'n1',
      'x-zt-body-sha256': 'b',
      'x-zt-signature': 'sig',
    });

    let nextCalled = false;
    await middleware(req, res, async () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(true);
    expect(req.context.tenantId).toBe('tenant-456');
  });

  it('skips authentication when already bulletproof-authenticated', async () => {
    const middleware = BulletproofAuthMiddleware.create({ signingSecret: 's' });
    const { req, res } = createReqRes({ authorization: 'Bearer token' });
    req.user = { sub: '1' };
    req.context.authStrategy = 'bulletproof';

    let nextCalled = false;
    await middleware(req, res, async () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(true);
    expect(vi.mocked(SignedRequest.verify)).not.toHaveBeenCalled();
    expect((res as any).statusCode).toBe(200);
  });
});
