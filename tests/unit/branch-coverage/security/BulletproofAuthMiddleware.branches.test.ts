import type { IRequest } from '@http/Request';
import type { IResponse } from '@http/Response';
import { BulletproofAuthMiddleware } from '@middleware/BulletproofAuthMiddleware';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Branch-focused coverage for BulletproofAuthMiddleware. Every collaborator
 * (JWT, signed request, sessions, device store, env) is a deterministic mock.
 */
const mocks = vi.hoisted(() => ({
  envGet: vi.fn((_key: string, _fallback?: string) => '' as string),
  securityConfig: { jwt: { algorithm: 'HS256' as string, secret: 'secret' } },
  setHmacSecret: vi.fn(),
  jwtVerify: vi.fn(() => ({ sub: 'u1', deviceId: 'dev-1' } as Record<string, unknown>)),
  signedVerify: vi.fn(),
  sha256Hex: vi.fn(async () => 'uah'),
  sessionsIsActive: vi.fn(async () => true),
  findByDeviceId: vi.fn(async () => null as unknown),
  debug: vi.fn(),
}));

vi.mock('@config/env', () => ({
  Env: {
    get: mocks.envGet,
    getBool: vi.fn(() => false),
    getInt: vi.fn(() => 0),
    getFloat: vi.fn(() => 0),
  },
}));

vi.mock('@config/security', () => ({ securityConfig: mocks.securityConfig }));

vi.mock('@config/logger', () => ({ Logger: { debug: mocks.debug, error: vi.fn() } }));

vi.mock('@security/JwtManager', () => ({
  JwtManager: {
    create: () => ({ setHmacSecret: mocks.setHmacSecret, verify: mocks.jwtVerify }),
  },
}));

vi.mock('@security/SignedRequest', () => ({
  SignedRequest: { verify: mocks.signedVerify, sha256Hex: mocks.sha256Hex },
}));

vi.mock('@security/JwtSessions', () => ({ JwtSessions: { isActive: mocks.sessionsIsActive } }));

vi.mock('@security/BulletproofDeviceStore', () => ({
  BulletproofDeviceStore: { findByDeviceId: mocks.findByDeviceId },
}));

const baseHeaders: Record<string, unknown> = {
  authorization: 'Bearer token',
  'x-zt-key-id': 'dev-1',
  'x-zt-device-id': 'dev-1',
  'x-zt-timestamp': '1234567890',
  'x-zt-nonce': '12345678',
  'x-zt-body-sha256': 'body-hash',
  'x-zt-signature': 'signature',
};

type ReqOverrides = {
  context?: Record<string, unknown> | undefined;
  getMethod?: (() => string) | undefined;
  getPath?: (() => string) | undefined;
  getRaw?: (() => unknown) | undefined;
};

const createReqRes = (headers: Record<string, unknown> = {}, overrides: ReqOverrides = {}) => {
  const res = {
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
  } as unknown as IResponse;

  const req = {
    user: undefined,
    context: overrides.context === undefined ? {} : overrides.context,
    getMethod: overrides.getMethod,
    getPath: overrides.getPath ?? (() => '/me'),
    getRaw: overrides.getRaw ?? (() => ({ url: '/me?x=1' })),
    getHeader: (name: string) => headers[name.toLowerCase()],
  } as unknown as IRequest;

  return { req, res, next: vi.fn(async () => undefined) };
};

const run = async (
  headers: Record<string, unknown> = baseHeaders,
  overrides: ReqOverrides = {},
  options: Record<string, unknown> = { signingSecret: 's' }
) => {
  const middleware = BulletproofAuthMiddleware.create(options);
  const { req, res, next } = createReqRes(headers, overrides);
  await middleware(req, res, next);
  return { req, res, next };
};

const verifyArgs = () => mocks.signedVerify.mock.calls[0]?.[0] as Record<string, unknown>;

describe('branch coverage: BulletproofAuthMiddleware branches', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.envGet.mockImplementation(() => '');
    mocks.signedVerify.mockResolvedValue({
      ok: true,
      keyId: 'dev-1',
      timestampMs: 1234567890,
      nonce: '12345678',
    });
    mocks.jwtVerify.mockReturnValue({ sub: 'u1', deviceId: 'dev-1' });
    mocks.sessionsIsActive.mockResolvedValue(true);
    mocks.findByDeviceId.mockResolvedValue(null);
    mocks.sha256Hex.mockResolvedValue('uah');
    mocks.securityConfig.jwt.algorithm = 'HS256';
    mocks.securityConfig.jwt.secret = 'secret';
  });

  it('accepts array-valued authorization and device headers', async () => {
    const result = await run({
      ...baseHeaders,
      authorization: ['Bearer token'],
      'x-zt-device-id': ['dev-1'],
    });
    expect(result.next).toHaveBeenCalledOnce();

    const nonStringDevice = await run({
      ...baseHeaders,
      'x-zt-device-id': [123 as never],
    });
    expect(nonStringDevice.res.statusCode).toBe(401);
    expect(nonStringDevice.res.body).toEqual({ error: 'Missing or invalid device id' });
  });

  it('rejects missing, blank, non-bearer, and tokenless authorization headers', async () => {
    await expect(run({ ...baseHeaders, authorization: '' })).resolves.toMatchObject({
      res: { statusCode: 401, body: { error: 'Missing authorization header' } },
    });
    await expect(run({ ...baseHeaders, authorization: '    ' })).resolves.toMatchObject({
      res: { statusCode: 401, body: { error: 'Invalid authorization header format' } },
    });
    await expect(run({ ...baseHeaders, authorization: 'Basic abc' })).resolves.toMatchObject({
      res: { statusCode: 401, body: { error: 'Invalid authorization header format' } },
    });
    await expect(run({ ...baseHeaders, authorization: 'Bearer     ' })).resolves.toMatchObject({
      res: { statusCode: 401, body: { error: 'Invalid authorization header format' } },
    });
  });

  it('signs the raw body from all supported context representations', async () => {
    await run(baseHeaders, { context: { rawBodyText: '{"a":1}' } });
    expect(verifyArgs()['body']).toBe('{"a":1}');

    vi.clearAllMocks();
    const bytes = new Uint8Array([1, 2, 3]);
    await run(baseHeaders, { context: { rawBodyBytes: bytes } });
    expect(verifyArgs()['body']).toBe(bytes);

    vi.clearAllMocks();
    await run(baseHeaders, { context: { rawBodyBytes: bytes.buffer } });
    expect(verifyArgs()['body']).toEqual(bytes);
  });

  it('falls back through URL and path sources when the raw URL is unusable', async () => {
    await run(baseHeaders, { getRaw: () => ({ url: 123 as never }), getPath: () => '/fallback' });
    expect(String(verifyArgs()['url'])).toContain('/fallback');

    vi.clearAllMocks();
    await run(baseHeaders, { getRaw: () => ({ url: 123 as never }), getPath: () => undefined });
    expect(String(verifyArgs()['url'])).toBe('http://localhost/');

    vi.clearAllMocks();
    await run(baseHeaders, { getRaw: () => ({ url: 'relative/path' }) });
    expect(String(verifyArgs()['url'])).toBe('http://localhost/relative/path');

    vi.clearAllMocks();
    await run(baseHeaders, {
      getRaw: () => ({ url: 'https://example.com/absolute' }),
      getMethod: undefined,
    });
    expect(String(verifyArgs()['url'])).toBe('https://example.com/absolute');
    expect(verifyArgs()['method']).toBe('GET');
  });

  it('allows a missing device id and normalizes absent signing headers to undefined', async () => {
    const result = await run(
      { authorization: 'Bearer token' },
      {},
      { signingSecret: 's', requireDeviceId: false }
    );
    expect(result.next).toHaveBeenCalledOnce();
    expect(verifyArgs()['headers']).toEqual({
      'x-zt-key-id': undefined,
      'x-zt-timestamp': undefined,
      'x-zt-nonce': undefined,
      'x-zt-body-sha256': undefined,
      'x-zt-signature': undefined,
    });
    expect((result.req.context as Record<string, unknown>)['auth']).toMatchObject({
      deviceId: 'dev-1',
    });
  });

  it('rejects an over-long timezone when it is required', async () => {
    const result = await run(
      { ...baseHeaders, 'x-zt-timezone': 'A'.repeat(65) },
      {},
      { signingSecret: 's', requireTimezone: true }
    );
    expect(result.res.statusCode).toBe(401);
    expect(result.res.body).toEqual({ error: 'Missing or invalid timezone' });
  });

  it('accepts a valid required timezone', async () => {
    const result = await run(
      { ...baseHeaders, 'x-zt-timezone': 'UTC' },
      {},
      { signingSecret: 's', requireTimezone: true }
    );
    expect(result.next).toHaveBeenCalledOnce();
  });

  it('short-circuits on the key-id hint and deduplicates repeated backup secrets', async () => {
    mocks.envGet.mockImplementation((key: string) =>
      key === 'BULLETPROOF_SIGNING_SECRET_BK' ? 'backup,backup' : ''
    );
    const result = await run(baseHeaders);
    expect(result.next).toHaveBeenCalledOnce();
    // A successful key-id hinted attempt avoids trying any backups.
    expect(mocks.signedVerify).toHaveBeenCalledTimes(1);

    // When the primary fails on signature, only the single deduplicated backup is tried.
    vi.clearAllMocks();
    mocks.signedVerify.mockResolvedValueOnce({
      ok: false,
      code: 'INVALID_SIGNATURE',
      message: 'invalid signature',
    });
    const withBackup = await run(baseHeaders);
    expect(withBackup.next).toHaveBeenCalledOnce();
    expect(mocks.signedVerify).toHaveBeenCalledTimes(2);
  });

  it('treats a non-Error dynamic resolver failure as an unknown key when backups exist', async () => {
    mocks.envGet.mockImplementation((key: string) =>
      key === 'BULLETPROOF_SIGNING_SECRET_BK' ? '["backup-secret", 123]' : ''
    );
    mocks.signedVerify
      .mockRejectedValueOnce('plain device-store failure')
      .mockResolvedValueOnce({
        ok: true,
        keyId: 'dev-1',
        timestampMs: 1234567890,
        nonce: '12345678',
      });

    const result = await run(baseHeaders);
    expect(result.next).toHaveBeenCalledOnce();
    expect(mocks.signedVerify).toHaveBeenCalledTimes(2);
  });

  it('selects HMAC and RSA algorithms on their respective branches', async () => {
    await run(baseHeaders, {}, { signingSecret: 's', algorithm: 'HS512' });
    expect(mocks.setHmacSecret).toHaveBeenCalledWith('secret');

    vi.clearAllMocks();
    await run(baseHeaders, {}, { signingSecret: 's', algorithm: 'RS256' });
    expect(mocks.setHmacSecret).not.toHaveBeenCalled();
  });

  it('normalizes non-Error JWT verification failures', async () => {
    mocks.jwtVerify.mockImplementationOnce(() => {
      throw 'plain jwt failure';
    });
    const result = await run();
    expect(result.res.statusCode).toBe(401);
    expect(result.res.body).toEqual({ error: 'Invalid or expired token' });
    expect(mocks.debug).toHaveBeenCalled();
  });

  it('skips device, timezone, and user-agent claim checks when disabled', async () => {
    mocks.jwtVerify.mockReturnValue({ sub: 'u1', uah: 'wrong-hash' });
    const result = await run(
      { ...baseHeaders, 'user-agent': 'agent' },
      {},
      {
        signingSecret: 's',
        requireDeviceClaimMatch: false,
        requireUserAgentHashMatch: false,
      }
    );
    expect(result.next).toHaveBeenCalledOnce();
    expect(mocks.sha256Hex).not.toHaveBeenCalled();
  });

  it('does not invoke a custom nonce verifier for a short nonce', async () => {
    const verifyNonce = vi.fn(async () => true);
    mocks.signedVerify.mockImplementationOnce(
      async (params: { verifyNonce: (...args: unknown[]) => Promise<boolean> }) => {
        await params.verifyNonce('dev-1', 'short', 1000);
        return { ok: true, keyId: 'dev-1', timestampMs: 1234567890, nonce: 'short' };
      }
    );

    const shortNonceResult = await run(baseHeaders, {}, { signingSecret: 's', verifyNonce });
    // The mocked SignedRequest.verify ignores the verifier result, but the
    // middleware's own validation must short-circuit before calling it.
    expect(shortNonceResult.next).toHaveBeenCalledOnce();
    expect(verifyNonce).not.toHaveBeenCalled();

    vi.clearAllMocks();
    const longNonceVerify = vi.fn(async () => true);
    mocks.signedVerify.mockImplementationOnce(
      async (params: { verifyNonce: (...args: unknown[]) => Promise<boolean> }) => {
        await params.verifyNonce('dev-1', 'long-enough', 1000);
        return { ok: true, keyId: 'dev-1', timestampMs: 1234567890, nonce: 'long-enough' };
      }
    );
    const accepted = await run(baseHeaders, {}, { signingSecret: 's', verifyNonce: longNonceVerify });
    expect(accepted.next).toHaveBeenCalledOnce();
    expect(longNonceVerify).toHaveBeenCalledWith('dev-1', 'long-enough', 1000);
  });

  it('skips subject and tenant context fields when claims are blank or non-finite', async () => {
    mocks.jwtVerify.mockReturnValue({
      sub: '   ',
      deviceId: 'dev-1',
      tenant_id: Number.POSITIVE_INFINITY,
    });
    const result = await run();
    expect(result.next).toHaveBeenCalledOnce();
    expect((result.req.context as Record<string, unknown>)['userId']).toBeUndefined();
    expect((result.req.context as Record<string, unknown>)['tenantId']).toBeUndefined();
  });
});
