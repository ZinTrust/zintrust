import { ErrorFactory } from '@exceptions/ZintrustError';
import { isArray, isNonEmptyString, isObject } from '@helper/index';
import { detectRuntimePlatform, RuntimeServices } from '@runtime/RuntimeServices';
import type { JwtPayload } from '@security/JwtManager';

export type JwtVerifierAlgorithm = 'RS256';

type JwtVerifierJsonWebKey = Readonly<{
  alg?: string;
  crv?: string;
  d?: string;
  dp?: string;
  dq?: string;
  e?: string;
  ext?: boolean;
  k?: string;
  key_ops?: string[];
  kid?: string;
  kty?: string;
  n?: string;
  oth?: unknown[];
  p?: string;
  q?: string;
  qi?: string;
  use?: string;
  x?: string;
  x5c?: string[];
  x5t?: string;
  'x5t#S256'?: string;
  x5u?: string;
  y?: string;
}>;

export type JwtVerifierJwk = JwtVerifierJsonWebKey &
  Readonly<{
    kid?: string;
    alg?: string;
    use?: string;
  }>;

export type JwtVerifierJwksDocument = Readonly<{
  keys: readonly JwtVerifierJwk[];
}>;

export type JwtVerifierFailureReason =
  | 'invalid_token_format'
  | 'invalid_header'
  | 'invalid_payload'
  | 'missing_kid'
  | 'key_not_found'
  | 'jwks_fetch_failed'
  | 'invalid_jwks'
  | 'unsupported_algorithm'
  | 'invalid_jwk'
  | 'invalid_signature'
  | 'issuer_mismatch'
  | 'audience_mismatch'
  | 'token_expired'
  | 'token_not_yet_valid';

export type JwtVerifierFailure = Readonly<{
  ok: false;
  reason: JwtVerifierFailureReason;
  message: string;
  details?: unknown;
}>;

export type JwtVerifierSuccess = Readonly<{
  ok: true;
  payload: JwtPayload;
  header: Readonly<Record<string, unknown>>;
  jwk: JwtVerifierJwk;
  cacheHit?: boolean;
}>;

export type JwtVerifierResult = JwtVerifierSuccess | JwtVerifierFailure;

export type JwtVerifierCommonInput = Readonly<{
  token: string;
  algorithm?: JwtVerifierAlgorithm;
  issuer?: string | readonly string[];
  audience?: string | readonly string[];
  nowMs?: number;
}>;

export type JwtVerifierWithJwkInput = JwtVerifierCommonInput &
  Readonly<{
    jwk: JwtVerifierJwk;
  }>;

export type JwtVerifierWithJwksInput = JwtVerifierCommonInput &
  Readonly<{
    jwksUrl: string;
    cacheKey?: string;
    cacheTtlSeconds?: number;
    fetcher?: typeof fetch;
  }>;

type JwtTokenParts = Readonly<{
  encodedHeader: string;
  encodedPayload: string;
  encodedSignature: string;
}>;

type CachedJwks = Readonly<{
  expiresAtMs: number;
  jwks: JwtVerifierJwksDocument;
}>;

const jwksCache = new Map<string, CachedJwks>();

const getRuntime = (): RuntimeServices => RuntimeServices.create(detectRuntimePlatform());

const isFailure = (value: unknown): value is JwtVerifierFailure => {
  return isObject(value) && value['ok'] === false && typeof value['reason'] === 'string';
};

const toFailure = (
  reason: JwtVerifierFailureReason,
  message: string,
  details?: unknown
): JwtVerifierFailure => ({
  ok: false,
  reason,
  message,
  ...(details === undefined ? {} : { details }),
});

const toThrownError = (failure: JwtVerifierFailure): Error => {
  return ErrorFactory.createSecurityError(failure.message, {
    reason: failure.reason,
    ...(failure.details === undefined ? {} : { details: failure.details }),
  });
};

const normalizeBase64Url = (value: string): string => {
  const normalized = value.replaceAll('-', '+').replaceAll('_', '/');
  const padding = normalized.length % 4;
  return padding === 0 ? normalized : normalized.padEnd(normalized.length + (4 - padding), '=');
};

const base64UrlToBytes = (value: string): Uint8Array => {
  const binary = globalThis.atob(normalizeBase64Url(value));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.codePointAt(index) ?? 0;
  }
  return bytes;
};

const decodeJwtSegment = <T>(value: string): T => {
  const json = new TextDecoder().decode(base64UrlToBytes(value));
  return JSON.parse(json) as T;
};

const parseTokenParts = (token: string): JwtTokenParts | JwtVerifierFailure => {
  const parts = token.split('.');
  if (parts.length !== 3) {
    return toFailure('invalid_token_format', 'JWT must contain header, payload, and signature');
  }

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  if (
    !isNonEmptyString(encodedHeader) ||
    !isNonEmptyString(encodedPayload) ||
    !isNonEmptyString(encodedSignature)
  ) {
    return toFailure('invalid_token_format', 'JWT parts must not be empty');
  }

  return { encodedHeader, encodedPayload, encodedSignature };
};

const parseHeader = (
  encodedHeader: string
): Readonly<Record<string, unknown>> | JwtVerifierFailure => {
  try {
    const header = decodeJwtSegment<Record<string, unknown>>(encodedHeader);
    if (!isObject(header)) {
      return toFailure('invalid_header', 'JWT header must be an object');
    }
    return header;
  } catch (error) {
    return toFailure('invalid_header', 'JWT header is not valid JSON', {
      cause: error instanceof Error ? error.message : String(error),
    });
  }
};

const parsePayload = (encodedPayload: string): JwtPayload | JwtVerifierFailure => {
  try {
    const payload = decodeJwtSegment<JwtPayload>(encodedPayload);
    if (!isObject(payload)) {
      return toFailure('invalid_payload', 'JWT payload must be an object');
    }
    return payload;
  } catch (error) {
    return toFailure('invalid_payload', 'JWT payload is not valid JSON', {
      cause: error instanceof Error ? error.message : String(error),
    });
  }
};

const getAlgorithm = (inputAlgorithm?: JwtVerifierAlgorithm): JwtVerifierAlgorithm => {
  return inputAlgorithm ?? 'RS256';
};

const validateHeaderAlgorithm = (
  header: Readonly<Record<string, unknown>>,
  algorithm: JwtVerifierAlgorithm
): JwtVerifierFailure | undefined => {
  if (header['alg'] !== algorithm) {
    return toFailure('unsupported_algorithm', `JWT algorithm must be ${algorithm}`);
  }
  return undefined;
};

const normalizeExpectedValues = (value?: string | readonly string[]): string[] => {
  if (value === undefined) return [];
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed === '' ? [] : [trimmed];
  }

  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter((item) => item !== '');
};

const normalizeAudienceClaim = (audience: unknown): string[] => {
  if (typeof audience === 'string') {
    const trimmed = audience.trim();
    return trimmed === '' ? [] : [trimmed];
  }

  if (isArray(audience)) {
    return audience
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter((item) => item !== '');
  }

  return [];
};

const validateClaims = (
  payload: JwtPayload,
  input: JwtVerifierCommonInput
): JwtVerifierFailure | undefined => {
  const nowMs = input.nowMs ?? Date.now();

  if (
    typeof payload.exp === 'number' &&
    Number.isFinite(payload.exp) &&
    nowMs >= payload.exp * 1000
  ) {
    return toFailure('token_expired', 'JWT has expired');
  }

  if (
    typeof payload.nbf === 'number' &&
    Number.isFinite(payload.nbf) &&
    nowMs < payload.nbf * 1000
  ) {
    return toFailure('token_not_yet_valid', 'JWT is not valid yet');
  }

  const expectedIssuers = normalizeExpectedValues(input.issuer);
  if (expectedIssuers.length > 0) {
    const issuer = typeof payload.iss === 'string' ? payload.iss.trim() : '';
    if (!expectedIssuers.includes(issuer)) {
      return toFailure('issuer_mismatch', 'JWT issuer did not match the expected issuer', {
        expected: expectedIssuers,
        received: issuer,
      });
    }
  }

  const expectedAudiences = normalizeExpectedValues(input.audience);
  if (expectedAudiences.length > 0) {
    const audiences = normalizeAudienceClaim(payload.aud);
    const matched = audiences.some((audience) => expectedAudiences.includes(audience));
    if (!matched) {
      return toFailure('audience_mismatch', 'JWT audience did not match the expected audience', {
        expected: expectedAudiences,
        received: audiences,
      });
    }
  }

  return undefined;
};

const validateJwkForAlgorithm = (
  jwk: JwtVerifierJwk,
  algorithm: JwtVerifierAlgorithm
): JwtVerifierFailure | undefined => {
  if (jwk.kty !== 'RSA') {
    return toFailure('invalid_jwk', 'JWK must use RSA for RS256 verification', {
      kty: jwk.kty,
    });
  }

  if (!isNonEmptyString(jwk.n) || !isNonEmptyString(jwk.e)) {
    return toFailure('invalid_jwk', 'JWK must include RSA modulus and exponent');
  }

  if (isNonEmptyString(jwk.alg) && jwk.alg !== algorithm) {
    return toFailure('invalid_jwk', 'JWK algorithm does not match the requested JWT algorithm', {
      expected: algorithm,
      received: jwk.alg,
    });
  }

  if (isNonEmptyString(jwk.use) && jwk.use !== 'sig') {
    return toFailure('invalid_jwk', 'JWK use must allow signature verification', {
      use: jwk.use,
    });
  }

  return undefined;
};

const verifyRs256Signature = async (params: {
  jwk: JwtVerifierJwk;
  signingInput: string;
  encodedSignature: string;
}): Promise<boolean | JwtVerifierFailure> => {
  const subtle = getRuntime().crypto.subtle as {
    importKey: (...args: unknown[]) => Promise<unknown>;
    verify: (...args: unknown[]) => Promise<boolean>;
  };

  try {
    const key: unknown = await subtle.importKey(
      'jwk',
      params.jwk,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify']
    );

    const signature = base64UrlToBytes(params.encodedSignature);
    const signingInput = new TextEncoder().encode(params.signingInput);

    return await subtle.verify('RSASSA-PKCS1-v1_5', key, signature, signingInput);
  } catch (error) {
    return toFailure('invalid_jwk', 'JWK could not be imported for signature verification', {
      cause: error instanceof Error ? error.message : String(error),
    });
  }
};

const fetchJwks = async (
  input: JwtVerifierWithJwksInput
): Promise<{ jwks: JwtVerifierJwksDocument; cacheHit: boolean } | JwtVerifierFailure> => {
  const cacheKey = (input.cacheKey ?? input.jwksUrl).trim();
  const nowMs = input.nowMs ?? Date.now();
  const cached = jwksCache.get(cacheKey);
  if (cached !== undefined && cached.expiresAtMs > nowMs) {
    return { jwks: cached.jwks, cacheHit: true };
  }

  const fetcher = input.fetcher ?? getRuntime().fetch;
  let response: Response;

  try {
    response = await fetcher(input.jwksUrl, {
      headers: { accept: 'application/json' },
    });
  } catch (error) {
    return toFailure('jwks_fetch_failed', 'Failed to fetch JWKS document', {
      jwksUrl: input.jwksUrl,
      cause: error instanceof Error ? error.message : String(error),
    });
  }

  if (!response.ok) {
    return toFailure('jwks_fetch_failed', 'JWKS endpoint returned a non-success response', {
      jwksUrl: input.jwksUrl,
      status: response.status,
    });
  }

  let body: unknown;
  try {
    body = (await response.json()) as unknown;
  } catch (error) {
    return toFailure('invalid_jwks', 'JWKS response was not valid JSON', {
      jwksUrl: input.jwksUrl,
      cause: error instanceof Error ? error.message : String(error),
    });
  }

  if (!isObject(body) || !isArray(body['keys'])) {
    return toFailure('invalid_jwks', 'JWKS response must contain a keys array', {
      jwksUrl: input.jwksUrl,
    });
  }

  const jwks: JwtVerifierJwksDocument = {
    keys: body['keys'].filter((item): item is JwtVerifierJwk => isObject(item)),
  };

  const cacheTtlSeconds = Number.isFinite(input.cacheTtlSeconds) ? input.cacheTtlSeconds : 3600;
  const ttlMs = Math.max(1, cacheTtlSeconds) * 1000;
  jwksCache.set(cacheKey, { jwks, expiresAtMs: nowMs + ttlMs });
  return { jwks, cacheHit: false };
};

const resolveJwkFromJwks = (
  header: Readonly<Record<string, unknown>>,
  jwks: JwtVerifierJwksDocument,
  algorithm: JwtVerifierAlgorithm
): JwtVerifierJwk | JwtVerifierFailure => {
  const kid = typeof header['kid'] === 'string' ? header['kid'].trim() : '';
  if (kid === '') {
    return toFailure('missing_kid', 'JWT header must include a kid when verifying with JWKS');
  }

  const jwk = jwks.keys.find((item) => {
    if (item.kid !== kid) return false;
    if (isNonEmptyString(item.alg) && item.alg !== algorithm) return false;
    if (isNonEmptyString(item.use) && item.use !== 'sig') return false;
    return true;
  });

  if (jwk === undefined) {
    return toFailure('key_not_found', 'No matching JWK was found for the JWT kid', { kid });
  }

  return jwk;
};

const verifyTokenWithJwk = async (
  input: JwtVerifierCommonInput,
  jwk: JwtVerifierJwk,
  cacheHit?: boolean
): Promise<JwtVerifierResult> => {
  const tokenParts = parseTokenParts(input.token);
  if (isFailure(tokenParts)) return tokenParts;

  const header = parseHeader(tokenParts.encodedHeader);
  if (isFailure(header)) return header;

  const payload = parsePayload(tokenParts.encodedPayload);
  if (isFailure(payload)) return payload;

  const algorithm = getAlgorithm(input.algorithm);
  const headerFailure = validateHeaderAlgorithm(header, algorithm);
  if (headerFailure !== undefined) return headerFailure;

  const jwkFailure = validateJwkForAlgorithm(jwk, algorithm);
  if (jwkFailure !== undefined) return jwkFailure;

  const signatureCheck = await verifyRs256Signature({
    jwk,
    signingInput: `${tokenParts.encodedHeader}.${tokenParts.encodedPayload}`,
    encodedSignature: tokenParts.encodedSignature,
  });

  if (signatureCheck !== true) {
    return signatureCheck === false
      ? toFailure('invalid_signature', 'JWT signature could not be verified')
      : signatureCheck;
  }

  const claimsFailure = validateClaims(payload, input);
  if (claimsFailure !== undefined) return claimsFailure;

  return { ok: true, payload, header, jwk, ...(cacheHit === undefined ? {} : { cacheHit }) };
};

const verifyWithJwkResult = async (input: JwtVerifierWithJwkInput): Promise<JwtVerifierResult> => {
  return verifyTokenWithJwk(input, input.jwk);
};

const verifyWithJwksResult = async (
  input: JwtVerifierWithJwksInput
): Promise<JwtVerifierResult> => {
  const fetched = await fetchJwks(input);
  if (isFailure(fetched)) return fetched;

  const tokenParts = parseTokenParts(input.token);
  if (isFailure(tokenParts)) return tokenParts;

  const header = parseHeader(tokenParts.encodedHeader);
  if (isFailure(header)) return header;

  const algorithm = getAlgorithm(input.algorithm);
  const headerFailure = validateHeaderAlgorithm(header, algorithm);
  if (headerFailure !== undefined) return headerFailure;

  const jwk = resolveJwkFromJwks(header, fetched.jwks, algorithm);
  if (isFailure(jwk)) return jwk;

  return verifyTokenWithJwk(input, jwk, fetched.cacheHit);
};

const verifyWithJwk = async (input: JwtVerifierWithJwkInput): Promise<JwtPayload> => {
  const result = await verifyWithJwkResult(input);
  if (!result.ok) throw toThrownError(result);
  return result.payload;
};

const verifyWithJwks = async (input: JwtVerifierWithJwksInput): Promise<JwtPayload> => {
  const result = await verifyWithJwksResult(input);
  if (!result.ok) throw toThrownError(result);
  return result.payload;
};

const clearCache = (cacheKey?: string): void => {
  if (!isNonEmptyString(cacheKey)) {
    jwksCache.clear();
    return;
  }

  jwksCache.delete(cacheKey.trim());
};

export const JwtVerifier = Object.freeze({
  clearCache,
  verifyWithJwk,
  verifyWithJwkResult,
  verifyWithJwks,
  verifyWithJwksResult,
});

export default JwtVerifier;
