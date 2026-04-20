import { JwtVerifier, type JwtPayload, type JwtVerifierJwk } from '@zintrust/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type JwtKeyPair = Readonly<{
  privateKey: CryptoKey;
  publicJwk: JwtVerifierJwk;
}>;

const base64UrlEncodeJson = (value: unknown): string => {
  return Buffer.from(JSON.stringify(value), 'utf8')
    .toString('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll(/=+$/g, '');
};

const base64UrlEncodeBytes = (value: ArrayBuffer): string => {
  return Buffer.from(value)
    .toString('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll(/=+$/g, '');
};

const generateJwtKeyPair = async (): Promise<JwtKeyPair> => {
  const pair = await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify']
  );

  const publicJwk = (await crypto.subtle.exportKey('jwk', pair.publicKey)) as JwtVerifierJwk;
  return {
    privateKey: pair.privateKey,
    publicJwk: {
      ...publicJwk,
      alg: 'RS256',
      kid: 'test-kid',
      use: 'sig',
    },
  };
};

const createRs256Token = async (params: {
  privateKey: CryptoKey;
  payload: JwtPayload;
  kid?: string;
}): Promise<string> => {
  const header = {
    alg: 'RS256',
    typ: 'JWT',
    ...(params.kid === undefined ? {} : { kid: params.kid }),
  };
  const encodedHeader = base64UrlEncodeJson(header);
  const encodedPayload = base64UrlEncodeJson(params.payload);
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    params.privateKey,
    new TextEncoder().encode(signingInput)
  );

  return `${signingInput}.${base64UrlEncodeBytes(signature)}`;
};

describe('JwtVerifier', () => {
  beforeEach(() => {
    JwtVerifier.clearCache();
    vi.restoreAllMocks();
  });

  it('verifies a JWT from JWKS and reuses the cached document until ttl expires', async () => {
    const keyPair = await generateJwtKeyPair();
    const token = await createRs256Token({
      privateKey: keyPair.privateKey,
      payload: {
        sub: 'user-1',
        iss: 'https://appleid.apple.com',
        aud: 'apple-client-id',
        exp: Math.floor(Date.now() / 1000) + 300,
      },
      kid: keyPair.publicJwk.kid,
    });

    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => {
      return new Response(JSON.stringify({ keys: [keyPair.publicJwk] }), { status: 200 });
    });

    const first = await JwtVerifier.verifyWithJwksResult({
      token,
      jwksUrl: 'https://appleid.apple.com/auth/keys',
      issuer: 'https://appleid.apple.com',
      audience: 'apple-client-id',
      cacheKey: 'apple-jwks',
      cacheTtlSeconds: 60,
      nowMs: 1_000,
      fetcher,
    });
    const second = await JwtVerifier.verifyWithJwksResult({
      token,
      jwksUrl: 'https://appleid.apple.com/auth/keys',
      issuer: 'https://appleid.apple.com',
      audience: 'apple-client-id',
      cacheKey: 'apple-jwks',
      cacheTtlSeconds: 60,
      nowMs: 50_000,
      fetcher,
    });
    const third = await JwtVerifier.verifyWithJwksResult({
      token,
      jwksUrl: 'https://appleid.apple.com/auth/keys',
      issuer: 'https://appleid.apple.com',
      audience: 'apple-client-id',
      cacheKey: 'apple-jwks',
      cacheTtlSeconds: 60,
      nowMs: 70_000,
      fetcher,
    });

    expect(first).toMatchObject({
      ok: true,
      payload: expect.objectContaining({ sub: 'user-1' }),
      cacheHit: false,
    });
    expect(second).toMatchObject({ ok: true, cacheHit: true });
    expect(third).toMatchObject({ ok: true, cacheHit: false });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('verifies a JWT directly from a single JWK', async () => {
    const keyPair = await generateJwtKeyPair();
    const token = await createRs256Token({
      privateKey: keyPair.privateKey,
      payload: {
        sub: 'user-2',
        iss: 'https://issuer.example.com',
        aud: ['web-client', 'mobile-client'],
        exp: Math.floor(Date.now() / 1000) + 300,
      },
      kid: keyPair.publicJwk.kid,
    });

    await expect(
      JwtVerifier.verifyWithJwk({
        token,
        jwk: keyPair.publicJwk,
        issuer: 'https://issuer.example.com',
        audience: 'mobile-client',
      })
    ).resolves.toMatchObject({ sub: 'user-2' });
  });

  it('returns missing_kid without fetching JWKS when the token header does not include a kid', async () => {
    const keyPair = await generateJwtKeyPair();
    const token = await createRs256Token({
      privateKey: keyPair.privateKey,
      payload: { sub: 'user-3', exp: Math.floor(Date.now() / 1000) + 300 },
    });
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify({ keys: [keyPair.publicJwk] }), { status: 200 }));

    const result = await JwtVerifier.verifyWithJwksResult({
      token,
      jwksUrl: 'https://issuer.example.com/jwks',
      fetcher,
    });

    expect(result).toEqual({
      ok: false,
      reason: 'missing_kid',
      message: 'JWT header must include a kid when verifying with JWKS',
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('returns unsupported_algorithm without fetching JWKS when the JWT alg does not match', async () => {
    const token = `${base64UrlEncodeJson({ alg: 'HS256', typ: 'JWT', kid: 'test-kid' })}.${base64UrlEncodeJson({ sub: 'user-3' })}.signature`;
    const fetcher = vi.fn<typeof fetch>();

    const result = await JwtVerifier.verifyWithJwksResult({
      token,
      jwksUrl: 'https://issuer.example.com/jwks',
      fetcher,
    });

    expect(result).toEqual({
      ok: false,
      reason: 'unsupported_algorithm',
      message: 'JWT algorithm must be RS256',
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('returns key_not_found when no JWKS key matches the token kid', async () => {
    const keyPair = await generateJwtKeyPair();
    const token = await createRs256Token({
      privateKey: keyPair.privateKey,
      payload: { sub: 'user-4', exp: Math.floor(Date.now() / 1000) + 300 },
      kid: 'missing-kid',
    });

    const result = await JwtVerifier.verifyWithJwksResult({
      token,
      jwksUrl: 'https://issuer.example.com/jwks',
      fetcher: vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          new Response(JSON.stringify({ keys: [keyPair.publicJwk] }), { status: 200 })
        ),
    });

    expect(result).toMatchObject({ ok: false, reason: 'key_not_found' });
  });

  it('returns issuer_mismatch and audience_mismatch failures for claim mismatches', async () => {
    const keyPair = await generateJwtKeyPair();
    const token = await createRs256Token({
      privateKey: keyPair.privateKey,
      payload: {
        sub: 'user-5',
        iss: 'https://issuer.example.com',
        aud: 'expected-audience',
        exp: Math.floor(Date.now() / 1000) + 300,
      },
      kid: keyPair.publicJwk.kid,
    });

    const issuerResult = await JwtVerifier.verifyWithJwkResult({
      token,
      jwk: keyPair.publicJwk,
      issuer: 'https://other.example.com',
    });
    const audienceResult = await JwtVerifier.verifyWithJwkResult({
      token,
      jwk: keyPair.publicJwk,
      audience: 'other-audience',
    });

    expect(issuerResult).toMatchObject({ ok: false, reason: 'issuer_mismatch' });
    expect(audienceResult).toMatchObject({ ok: false, reason: 'audience_mismatch' });
  });

  it('returns invalid_signature when the token payload is tampered after signing', async () => {
    const keyPair = await generateJwtKeyPair();
    const token = await createRs256Token({
      privateKey: keyPair.privateKey,
      payload: { sub: 'user-6', exp: Math.floor(Date.now() / 1000) + 300 },
      kid: keyPair.publicJwk.kid,
    });
    const [encodedHeader, , encodedSignature] = token.split('.');
    const tamperedPayload = base64UrlEncodeJson({
      sub: 'tampered',
      exp: Math.floor(Date.now() / 1000) + 300,
    });
    const tamperedToken = `${encodedHeader}.${tamperedPayload}.${encodedSignature}`;

    const result = await JwtVerifier.verifyWithJwkResult({
      token: tamperedToken,
      jwk: keyPair.publicJwk,
    });

    expect(result).toEqual({
      ok: false,
      reason: 'invalid_signature',
      message: 'JWT signature could not be verified',
    });
  });

  it('throws a typed security error from verifyWithJwks with the failure reason in details', async () => {
    const keyPair = await generateJwtKeyPair();
    const token = await createRs256Token({
      privateKey: keyPair.privateKey,
      payload: { sub: 'user-7', exp: Math.floor(Date.now() / 1000) + 300 },
      kid: 'unknown-kid',
    });

    await expect(
      JwtVerifier.verifyWithJwks({
        token,
        jwksUrl: 'https://issuer.example.com/jwks',
        fetcher: vi
          .fn<typeof fetch>()
          .mockResolvedValue(
            new Response(JSON.stringify({ keys: [keyPair.publicJwk] }), { status: 200 })
          ),
      })
    ).rejects.toMatchObject({
      code: 'SECURITY_ERROR',
      details: { reason: 'key_not_found' },
    });
  });

  it('is exposed from the root entrypoint', async () => {
    const core = await import('../../../src/index');
    expect(core.JwtVerifier).toBe(JwtVerifier);
  });
});
