import { JwtVerifier, type JwtVerifierJwk } from '@security/JwtVerifier';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * Branch-focused coverage for JwtVerifier. RSA keys are generated once in-process;
 * all JWKS fetches are injected as mocks, so there is no network access.
 */
const encodeJson = (value: unknown): string =>
  Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');

const encodeText = (value: string): string => Buffer.from(value, 'utf8').toString('base64url');

const encodeBytes = (value: ArrayBuffer): string => Buffer.from(value).toString('base64url');

let privateKey: CryptoKey;
let jwk: JwtVerifierJwk;

const makeToken = async (
  payloadJson: string,
  header: Record<string, unknown> = { alg: 'RS256', typ: 'JWT' }
): Promise<string> => {
  const encodedHeader = encodeJson(header);
  const encodedPayload = encodeText(payloadJson);
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    privateKey,
    new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`)
  );
  return `${encodedHeader}.${encodedPayload}.${encodeBytes(signature)}`;
};

const makeUnsignedToken = (
  headerJson: string,
  payloadJson: string,
  signature = 'c2ln'
): string => `${encodeText(headerJson)}.${encodeText(payloadJson)}.${signature}`;

const jwksFetcher = (keys: unknown[] = [jwk]) =>
  vi.fn<typeof fetch>().mockResolvedValue(
    new Response(JSON.stringify({ keys }), { status: 200 })
  );

describe('branch coverage: JwtVerifier branches', () => {
  beforeAll(async () => {
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
    privateKey = pair.privateKey;
    jwk = {
      ...((await crypto.subtle.exportKey('jwk', pair.publicKey)) as JwtVerifierJwk),
      alg: 'RS256',
      kid: 'k1',
      use: 'sig',
    };
  });

  afterEach(() => {
    JwtVerifier.clearCache();
    vi.restoreAllMocks();
    vi.resetModules();
    vi.doUnmock('@runtime/RuntimeServices');
  });

  it('decodes segments whose base64url length is already a multiple of four', async () => {
    // '{"sub":"ab"}' is 12 bytes, so no padding is stripped by base64url.
    const token = await makeToken('{"sub":"ab"}');
    const result = await JwtVerifier.verifyWithJwkResult({ token, jwk });
    expect(result).toMatchObject({ ok: true, payload: { sub: 'ab' } });
  });

  it('reports token format and non-object/invalid JSON header and payload failures', async () => {
    await expect(
      JwtVerifier.verifyWithJwkResult({ token: 'only.two', jwk })
    ).resolves.toMatchObject({ reason: 'invalid_token_format' });
    await expect(
      JwtVerifier.verifyWithJwkResult({ token: `.${encodeJson({ sub: 'a' })}.sig`, jwk })
    ).resolves.toMatchObject({ reason: 'invalid_token_format' });

    await expect(
      JwtVerifier.verifyWithJwkResult({
        token: makeUnsignedToken('[1,2]', '{}'),
        jwk,
      })
    ).resolves.toMatchObject({ reason: 'invalid_header' });
    await expect(
      JwtVerifier.verifyWithJwkResult({
        token: makeUnsignedToken('not-json', '{}'),
        jwk,
      })
    ).resolves.toMatchObject({ reason: 'invalid_header' });

    await expect(
      JwtVerifier.verifyWithJwkResult({
        token: makeUnsignedToken('{"alg":"RS256"}', '[1,2]'),
        jwk,
      })
    ).resolves.toMatchObject({ reason: 'invalid_payload' });
    await expect(
      JwtVerifier.verifyWithJwkResult({
        token: makeUnsignedToken('{"alg":"RS256"}', 'not-json'),
        jwk,
      })
    ).resolves.toMatchObject({ reason: 'invalid_payload' });
  });

  it('normalizes non-Error atob failures from both header and payload decoding', async () => {
    const originalAtob = globalThis.atob;
    let calls = 0;
    const headerSpy = vi.spyOn(globalThis, 'atob').mockImplementation((data: string) => {
      calls += 1;
      if (calls === 1) throw 'atob header failure';
      return originalAtob(data);
    });
    await expect(
      JwtVerifier.verifyWithJwkResult({
        token: makeUnsignedToken('{"alg":"RS256"}', '{}'),
        jwk,
      })
    ).resolves.toMatchObject({
      reason: 'invalid_header',
      details: { cause: 'atob header failure' },
    });
    headerSpy.mockRestore();

    calls = 0;
    const payloadSpy = vi.spyOn(globalThis, 'atob').mockImplementation((data: string) => {
      calls += 1;
      if (calls === 2) throw 'atob payload failure';
      return originalAtob(data);
    });
    await expect(
      JwtVerifier.verifyWithJwkResult({
        token: makeUnsignedToken('{"alg":"RS256"}', '{}'),
        jwk,
      })
    ).resolves.toMatchObject({
      reason: 'invalid_payload',
      details: { cause: 'atob payload failure' },
    });
    payloadSpy.mockRestore();
  });

  it('expires tokens and rejects tokens that are not yet valid', async () => {
    const expired = await makeToken('{"sub":"ab","exp":1000}');
    await expect(JwtVerifier.verifyWithJwkResult({ token: expired, jwk })).resolves.toMatchObject({
      reason: 'token_expired',
    });

    const future = await makeToken('{"sub":"ab","nbf":9999999999}');
    await expect(
      JwtVerifier.verifyWithJwkResult({ token: future, jwk, nowMs: 1000 })
    ).resolves.toMatchObject({ reason: 'token_not_yet_valid' });

    const nonNumericNbf = await makeToken('{"sub":"ab","nbf":"soon"}');
    await expect(
      JwtVerifier.verifyWithJwkResult({ token: nonNumericNbf, jwk, nowMs: 1000 })
    ).resolves.toMatchObject({ ok: true });
  });

  it('normalizes issuer and audience expectations and claims on both sides', async () => {
    const noClaims = await makeToken('{"sub":"ab","aud":"other"}');
    await expect(
      JwtVerifier.verifyWithJwkResult({
        token: noClaims,
        jwk,
        issuer: '   ',
        audience: '   ',
      })
    ).resolves.toMatchObject({ ok: true });

    const numericIssuer = await makeToken('{"sub":"ab","iss":123}');
    await expect(
      JwtVerifier.verifyWithJwkResult({ token: numericIssuer, jwk, issuer: 'expected' })
    ).resolves.toMatchObject({ reason: 'issuer_mismatch' });

    const emptyAudience = await makeToken('{"sub":"ab","aud":""}');
    await expect(
      JwtVerifier.verifyWithJwkResult({ token: emptyAudience, jwk, audience: 'expected' })
    ).resolves.toMatchObject({ reason: 'audience_mismatch' });

    const arrayAudience = await makeToken('{"sub":"ab","aud":[123,"aud"]}');
    await expect(
      JwtVerifier.verifyWithJwkResult({
        token: arrayAudience,
        jwk,
        audience: [123 as never, 'aud'],
      })
    ).resolves.toMatchObject({ ok: true });

    const stringAudience = await makeToken('{"sub":"ab","aud":" aud "}');
    await expect(
      JwtVerifier.verifyWithJwkResult({ token: stringAudience, jwk, audience: 'aud' })
    ).resolves.toMatchObject({ ok: true });

    const plainArrayAudience = await makeToken('{"sub":"ab","aud":["other","aud"]}');
    await expect(
      JwtVerifier.verifyWithJwkResult({ token: plainArrayAudience, jwk, audience: 'aud' })
    ).resolves.toMatchObject({ ok: true });
  });

  it('rejects JWKs with the wrong key type, missing modulus, mismatched alg, or wrong use', async () => {
    const token = await makeToken('{"sub":"ab"}');

    await expect(
      JwtVerifier.verifyWithJwkResult({ token, jwk: { kty: 'EC', n: 'n', e: 'AQAB' } })
    ).resolves.toMatchObject({ reason: 'invalid_jwk' });
    await expect(
      JwtVerifier.verifyWithJwkResult({ token, jwk: { kty: 'RSA', e: 'AQAB' } })
    ).resolves.toMatchObject({ reason: 'invalid_jwk' });
    await expect(
      JwtVerifier.verifyWithJwkResult({
        token,
        jwk: { kty: 'RSA', n: 'n', e: 'AQAB', alg: 'HS256' },
      })
    ).resolves.toMatchObject({ reason: 'invalid_jwk' });
    await expect(
      JwtVerifier.verifyWithJwkResult({
        token,
        jwk: { kty: 'RSA', n: 'n', e: 'AQAB', use: 'enc' },
      })
    ).resolves.toMatchObject({ reason: 'invalid_jwk' });
  });

  it('normalizes all JWKS fetch failures', async () => {
    const token = makeUnsignedToken('{"alg":"RS256","kid":"k1"}', '{}');
    const base = { token, jwksUrl: 'https://issuer.example/jwks' };

    await expect(
      JwtVerifier.verifyWithJwksResult({
        ...base,
        fetcher: vi.fn().mockRejectedValue(new Error('network down')),
      })
    ).resolves.toMatchObject({
      reason: 'jwks_fetch_failed',
      details: { cause: 'network down' },
    });
    await expect(
      JwtVerifier.verifyWithJwksResult({
        ...base,
        fetcher: vi.fn().mockRejectedValue('plain fetch failure'),
      })
    ).resolves.toMatchObject({
      reason: 'jwks_fetch_failed',
      details: { cause: 'plain fetch failure' },
    });

    await expect(
      JwtVerifier.verifyWithJwksResult({
        ...base,
        fetcher: vi.fn().mockResolvedValue(new Response('{}', { status: 500 })),
      })
    ).resolves.toMatchObject({ reason: 'jwks_fetch_failed' });

    const errorJsonResponse = {
      ok: true,
      status: 200,
      json: () => Promise.reject(new Error('bad json')),
    } as unknown as Response;
    await expect(
      JwtVerifier.verifyWithJwksResult({
        ...base,
        fetcher: vi.fn().mockResolvedValue(errorJsonResponse),
      })
    ).resolves.toMatchObject({ reason: 'invalid_jwks', details: { cause: 'bad json' } });

    const plainJsonResponse = {
      ok: true,
      status: 200,
      json: () => Promise.reject('plain json failure'),
    } as unknown as Response;
    await expect(
      JwtVerifier.verifyWithJwksResult({
        ...base,
        fetcher: vi.fn().mockResolvedValue(plainJsonResponse),
      })
    ).resolves.toMatchObject({ reason: 'invalid_jwks', details: { cause: 'plain json failure' } });

    await expect(
      JwtVerifier.verifyWithJwksResult({
        ...base,
        fetcher: vi.fn().mockResolvedValue(new Response('{}', { status: 200 })),
      })
    ).resolves.toMatchObject({ reason: 'invalid_jwks' });
  });

  it('filters JWKS keys by algorithm and use before accepting a match', async () => {
    const token = await makeToken('{"sub":"ab"}', { alg: 'RS256', typ: 'JWT', kid: 'k1' });
    const base = { token, jwksUrl: 'https://issuer.example/jwks' };

    await expect(
      JwtVerifier.verifyWithJwksResult({
        ...base,
        fetcher: jwksFetcher([{ ...jwk, alg: 'HS256' }]),
      })
    ).resolves.toMatchObject({ reason: 'key_not_found' });
    await expect(
      JwtVerifier.verifyWithJwksResult({
        ...base,
        fetcher: jwksFetcher([{ ...jwk, use: 'enc' }]),
      })
    ).resolves.toMatchObject({ reason: 'key_not_found' });

    // A JWK without optional alg/use hints is still eligible for the kid.
    await expect(
      JwtVerifier.verifyWithJwksResult({
        ...base,
        cacheKey: 'jwks-without-optional-hints',
        fetcher: jwksFetcher([{ kid: 'k1', kty: 'RSA', n: jwk.n, e: jwk.e }]),
      })
    ).resolves.toMatchObject({ ok: true });
  });

  it('takes the early-return paths of verifyWithJwkResult and verifyWithJwksResult', async () => {
    await expect(
      JwtVerifier.verifyWithJwkResult({ token: 'broken', jwk })
    ).resolves.toMatchObject({ reason: 'invalid_token_format' });
    await expect(
      JwtVerifier.verifyWithJwkResult({
        token: makeUnsignedToken('not-json', '{}'),
        jwk,
      })
    ).resolves.toMatchObject({ reason: 'invalid_header' });
    await expect(
      JwtVerifier.verifyWithJwkResult({
        token: makeUnsignedToken('{"alg":"RS256"}', 'not-json'),
        jwk,
      })
    ).resolves.toMatchObject({ reason: 'invalid_payload' });
    await expect(
      JwtVerifier.verifyWithJwkResult({
        token: await makeToken('{"sub":"ab"}', { alg: 'HS256', kid: 'k1' }),
        jwk,
      })
    ).resolves.toMatchObject({ reason: 'unsupported_algorithm' });
    await expect(
      JwtVerifier.verifyWithJwkResult({
        token: await makeToken('{"sub":"ab"}'),
        jwk: { ...jwk, kty: 'EC' },
      })
    ).resolves.toMatchObject({ reason: 'invalid_jwk' });

    await expect(
      JwtVerifier.verifyWithJwksResult({
        token: 'broken',
        jwksUrl: 'https://issuer.example/jwks',
      })
    ).resolves.toMatchObject({ reason: 'invalid_token_format' });
    await expect(
      JwtVerifier.verifyWithJwksResult({
        token: makeUnsignedToken('not-json', '{}'),
        jwksUrl: 'https://issuer.example/jwks',
      })
    ).resolves.toMatchObject({ reason: 'invalid_header' });
    await expect(
      JwtVerifier.verifyWithJwksResult({
        token: makeUnsignedToken('{"alg":"RS256","kid":"k1"}', '{}'),
        jwksUrl: 'https://issuer.example/jwks',
        fetcher: vi.fn().mockRejectedValue(new Error('offline')),
      })
    ).resolves.toMatchObject({ reason: 'jwks_fetch_failed' });
  });

  it('reports a tampered signature and throws normalized errors from the throwing helpers', async () => {
    const token = await makeToken('{"sub":"ab"}');
    const [header, _payload, signature] = token.split('.');
    const tampered = `${header}.${encodeText('{"sub":"cd"}')}.${signature}`;
    await expect(JwtVerifier.verifyWithJwkResult({ token: tampered, jwk })).resolves.toMatchObject({
      reason: 'invalid_signature',
    });

    await expect(
      JwtVerifier.verifyWithJwk({ token: 'broken', jwk })
    ).rejects.toMatchObject({ code: 'SECURITY_ERROR', details: { reason: 'invalid_token_format' } });
  });

  it('verifies with JWKS using the runtime fetcher and clears a named cache entry', async () => {
    vi.resetModules();
    vi.doMock('@runtime/RuntimeServices', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@runtime/RuntimeServices')>();
      const base = actual.RuntimeServices.create();
      const runtimeFetch = vi.fn<typeof fetch>().mockResolvedValue(
        new Response(JSON.stringify({ keys: [jwk] }), { status: 200 })
      );
      return {
        ...actual,
        RuntimeServices: {
          ...actual.RuntimeServices,
          create: () => ({ ...base, fetch: runtimeFetch }),
        },
      };
    });

    const { JwtVerifier: MockedJwtVerifier } = await import('@security/JwtVerifier');
    const token = await makeToken('{"sub":"ab"}', { alg: 'RS256', typ: 'JWT', kid: 'k1' });
    await expect(
      MockedJwtVerifier.verifyWithJwks({
        token,
        jwksUrl: 'https://issuer.example/jwks',
        cacheKey: 'named-cache',
        nowMs: 1_000,
      })
    ).resolves.toMatchObject({ sub: 'ab' });

    MockedJwtVerifier.clearCache('named-cache');
  });

  it('normalizes Error and non-Error JWK import failures', async () => {
    const importKeyMock = vi.fn();

    vi.resetModules();
    vi.doMock('@runtime/RuntimeServices', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@runtime/RuntimeServices')>();
      const base = actual.RuntimeServices.create();
      return {
        ...actual,
        RuntimeServices: {
          ...actual.RuntimeServices,
          create: () => ({
            ...base,
            crypto: {
              ...base.crypto,
              subtle: {
                importKey: importKeyMock,
                verify: vi.fn(async () => true),
              },
            },
          }),
        },
      };
    });

    const { JwtVerifier: MockedJwtVerifier } = await import('@security/JwtVerifier');
    const token = await makeToken('{"sub":"ab"}');

    importKeyMock.mockRejectedValueOnce(new Error('import key failed'));
    await expect(
      MockedJwtVerifier.verifyWithJwkResult({ token, jwk })
    ).resolves.toMatchObject({ reason: 'invalid_jwk', details: { cause: 'import key failed' } });

    importKeyMock.mockRejectedValueOnce('plain import failure');
    await expect(
      MockedJwtVerifier.verifyWithJwkResult({ token, jwk })
    ).resolves.toMatchObject({ reason: 'invalid_jwk', details: { cause: 'plain import failure' } });
  });
});
