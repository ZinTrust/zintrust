import { isString } from '@helper/index';
import type { SignedRequestVerifyResult } from '@security/SignedRequest';
import { SignedRequest } from '@security/SignedRequest';

export type ProxyNoncePutOptions = {
  expirationTtl?: number;
};

export type ProxyNonceNamespace = {
  get: (key: string) => Promise<string | null>;
  put: (key: string, value: string, options?: ProxyNoncePutOptions) => Promise<void>;
};

export type WorkerSigningOptions = Readonly<{
  secretEnvVar: string;
  missingSecretStatus: number;
  missingSecretMessage: string;
  defaultSigningWindowMs: number;
}>;

type WorkerRequestEnv = object;

type WorkerSigningResult =
  | { ok: true }
  | { ok: false; status: number; code: string; message: string };

const getEnvValue = (env: WorkerRequestEnv, name: string): unknown => {
  return (env as Record<string, unknown>)[name];
};

const getEnvInt = (env: WorkerRequestEnv, name: string, fallback: number): number => {
  const raw = getEnvValue(env, name);
  if (!isString(raw)) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const loadSigningSecret = (env: WorkerRequestEnv, secretEnvVar: string): string | null => {
  const directValue = getEnvValue(env, secretEnvVar);
  const direct = isString(directValue) ? directValue.trim() : '';
  if (direct !== '') return direct;

  const fallbackValue = getEnvValue(env, 'APP_KEY');
  const fallback = isString(fallbackValue) ? fallbackValue.trim() : '';
  if (fallback !== '') return fallback;

  return null;
};

const mapVerifyResult = (result: SignedRequestVerifyResult): WorkerSigningResult => {
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

const verifyNonceKv = async (
  kv: ProxyNonceNamespace,
  keyId: string,
  nonce: string,
  ttlMs: number
): Promise<boolean> => {
  const ttlSeconds = Math.max(1, Math.ceil(ttlMs / 1000));
  const storageKey = `nonce:${keyId}:${nonce}`;
  const existing = await kv.get(storageKey);
  if (existing !== null) return false;
  await kv.put(storageKey, '1', { expirationTtl: ttlSeconds });
  return true;
};

const verifySignedRequest = async (
  request: Request,
  env: WorkerRequestEnv,
  bodyBytes: Uint8Array,
  options: WorkerSigningOptions
): Promise<
  WorkerSigningResult | { ok: false; status: number; code: 'CONFIG_ERROR'; message: string }
> => {
  const secret = loadSigningSecret(env, options.secretEnvVar);
  if (secret === null) {
    return {
      ok: false,
      status: options.missingSecretStatus,
      code: 'CONFIG_ERROR',
      message: options.missingSecretMessage,
    };
  }

  const windowMs = getEnvInt(env, 'ZT_PROXY_SIGNING_WINDOW_MS', options.defaultSigningWindowMs);
  const nonceStore = getEnvValue(env, 'ZT_NONCES');
  return mapVerifyResult(
    await SignedRequest.verify({
      method: request.method,
      url: request.url,
      body: bodyBytes,
      headers: request.headers,
      windowMs,
      getSecretForKeyId: (_keyId: string) => secret,
      verifyNonce:
        nonceStore === undefined || nonceStore === null
          ? undefined
          : async (keyId: string, nonce: string, ttlMs: number): Promise<boolean> =>
              verifyNonceKv(nonceStore as ProxyNonceNamespace, keyId, nonce, ttlMs),
    })
  );
};

export const WorkerSigning = Object.freeze({
  verifyNonceKv,
  verifySignedRequest,
});
