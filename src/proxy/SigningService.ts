import { Env } from '@config/env';
import type { ProxySigningConfig } from '@proxy/ProxyConfig';
import type { SignedRequestVerifyResult } from '@security/SignedRequest';
import { SignedRequest } from '@security/SignedRequest';

export type SigningHeaders = Headers | Record<string, string | undefined>;

export type SigningVerificationResult =
  | { ok: true }
  | { ok: false; status: number; code: string; message: string };

export type SigningCredentials = Readonly<{
  keyId: string;
  secret: string;
}>;

type SigningServiceApi = Readonly<{
  normalizeConfig: (signing: ProxySigningConfig) => ProxySigningConfig;
  shouldVerify: (signing: ProxySigningConfig, headers: SigningHeaders) => boolean;
  verify: (params: {
    method: string;
    url: string | URL;
    body: string | Uint8Array;
    headers: SigningHeaders;
    signing: ProxySigningConfig;
  }) => Promise<SigningVerificationResult>;
  verifyWithKeyProvider: (params: {
    method: string;
    url: string | URL;
    body: string | Uint8Array;
    headers: SigningHeaders;
    windowMs: number;
    getSecretForKeyId: (keyId: string) => string | undefined | Promise<string | undefined>;
    verifyNonce?: (keyId: string, nonce: string, ttlMs: number) => Promise<boolean>;
  }) => Promise<SigningVerificationResult>;
}>;

const getHeader = (headers: SigningHeaders, name: string): string | undefined => {
  if (typeof (headers as Headers).get === 'function') {
    const value = (headers as Headers).get(name);
    return value ?? undefined;
  }
  return (headers as Record<string, string | undefined>)[name];
};

const hasSigningHeaders = (headers: SigningHeaders): boolean =>
  Boolean(
    (getHeader(headers, 'x-zt-key-id') ?? '') ||
    (getHeader(headers, 'x-zt-timestamp') ?? '') ||
    (getHeader(headers, 'x-zt-nonce') ?? '') ||
    (getHeader(headers, 'x-zt-body-sha256') ?? '') ||
    getHeader(headers, 'x-zt-signature')
  );

const normalizeKeyId = (keyId: string): string => {
  const trimmed = keyId.trim();
  if (trimmed !== '') return trimmed;
  const appNameRaw = Env.APP_NAME ?? 'zintrust';
  const normalized = (appNameRaw.trim() === '' ? 'zintrust' : appNameRaw)
    .toLowerCase()
    .replaceAll(/\s+/g, '_');
  return normalized;
};

const normalizeSecret = (secret: string): string => {
  const trimmed = secret.trim();
  if (trimmed !== '') return trimmed;
  return Env.APP_KEY ?? '';
};

const normalizeConfig = (signing: ProxySigningConfig): ProxySigningConfig => ({
  ...signing,
  keyId: normalizeKeyId(signing.keyId),
  secret: normalizeSecret(signing.secret),
});

export const normalizeSigningConfig: (signing: ProxySigningConfig) => ProxySigningConfig = (
  signing
): ProxySigningConfig => normalizeConfig(signing);

export const normalizeSigningCredentials: (input: SigningCredentials) => SigningCredentials = (
  input
): SigningCredentials => ({
  keyId: normalizeKeyId(input.keyId),
  secret: normalizeSecret(input.secret),
});

const shouldVerify = (signing: ProxySigningConfig, headers: SigningHeaders): boolean => {
  const normalized = normalizeConfig(signing);
  if (normalized.require) return true;
  if (
    normalized.keyId.trim() !== '' &&
    normalized.secret.trim() !== '' &&
    hasSigningHeaders(headers)
  ) {
    return true;
  }
  return false;
};

const mapVerifyResult = (result: SignedRequestVerifyResult): SigningVerificationResult => {
  if (result.ok) return { ok: true };

  if (result.code === 'MISSING_HEADER' || result.code === 'INVALID_TIMESTAMP') {
    return { ok: false, status: 401, code: result.code, message: result.message };
  }

  if (result.code === 'EXPIRED') {
    return { ok: false, status: 401, code: result.code, message: result.message };
  }

  if (result.code === 'UNKNOWN_KEY') {
    return { ok: false, status: 403, code: result.code, message: result.message };
  }

  if (result.code === 'REPLAYED') {
    return { ok: false, status: 409, code: result.code, message: result.message };
  }

  return { ok: false, status: 403, code: result.code, message: result.message };
};

const verify = async (params: {
  method: string;
  url: string | URL;
  body: string | Uint8Array;
  headers: SigningHeaders;
  signing: ProxySigningConfig;
}): Promise<SigningVerificationResult> => {
  const signing = normalizeConfig(params.signing);
  if (signing.require && (signing.keyId.trim() === '' || signing.secret.trim() === '')) {
    return {
      ok: false,
      status: 500,
      code: 'SIGNING_REQUIRED',
      message: 'Proxy signing is required but not configured',
    };
  }

  const result = await SignedRequest.verify({
    method: params.method,
    url: params.url,
    body: params.body,
    headers: params.headers,
    // eslint-disable-next-line @typescript-eslint/require-await
    getSecretForKeyId: async (keyId: string) =>
      keyId === signing.keyId ? signing.secret : undefined,
    windowMs: signing.windowMs,
  });

  return mapVerifyResult(result);
};

const verifyWithKeyProvider = async (params: {
  method: string;
  url: string | URL;
  body: string | Uint8Array;
  headers: SigningHeaders;
  windowMs: number;
  getSecretForKeyId: (keyId: string) => string | undefined | Promise<string | undefined>;
  verifyNonce?: (keyId: string, nonce: string, ttlMs: number) => Promise<boolean>;
}): Promise<SigningVerificationResult> => {
  const result = await SignedRequest.verify({
    method: params.method,
    url: params.url,
    body: params.body,
    headers: params.headers,
    windowMs: params.windowMs,
    getSecretForKeyId: params.getSecretForKeyId,
    verifyNonce: params.verifyNonce,
  });

  return mapVerifyResult(result);
};

export const SigningService: SigningServiceApi = Object.freeze({
  normalizeConfig,
  shouldVerify,
  verify,
  verifyWithKeyProvider,
});
