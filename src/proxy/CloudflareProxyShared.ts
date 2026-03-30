import { isString } from '@helper/index';
import { ErrorHandler } from '@proxy/ErrorHandler';
import { RequestValidator } from '@proxy/RequestValidator';
import { SigningService } from '@proxy/SigningService';

export type ProxyNoncePutOptions = {
  expirationTtl?: number;
};

export type ProxyNonceNamespace = {
  get: (key: string) => Promise<string | null>;
  put: (key: string, value: string, options?: ProxyNoncePutOptions) => Promise<void>;
};

type SignedRequestOptions = Readonly<{
  secretEnvVar: string;
  missingSecretStatus: number;
  missingSecretMessage: string;
  defaultSigningWindowMs: number;
}>;

type ReadAndVerifyJsonOptions = SignedRequestOptions &
  Readonly<{
    defaultMaxBodyBytes: number;
  }>;

type ProxyRequestEnv = object;

export const json = (status: number, body: unknown): Response => {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
};

export const toErrorResponse = (status: number, code: string, message: string): Response => {
  const error = ErrorHandler.toProxyError(status, code, message);
  return json(error.status, error.body);
};

const getEnvValue = (env: ProxyRequestEnv, name: string): unknown => {
  return (env as Record<string, unknown>)[name];
};

export const getEnvInt = (env: ProxyRequestEnv, name: string, fallback: number): number => {
  const raw = getEnvValue(env, name);
  if (!isString(raw)) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const normalizeBindingName = (value: unknown): string | null => {
  if (!isString(value)) return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
};

export const readBodyBytes = async (
  request: Request,
  maxBytes: number
): Promise<{ ok: true; bytes: Uint8Array; text: string } | { ok: false; response: Response }> => {
  const buf = await request.arrayBuffer();
  if (buf.byteLength > maxBytes) {
    return {
      ok: false,
      response: toErrorResponse(413, 'PAYLOAD_TOO_LARGE', 'Body too large'),
    };
  }

  const bytes = new Uint8Array(buf);
  const text = new TextDecoder().decode(bytes);
  return { ok: true, bytes, text };
};

export const parseOptionalJson = (
  text: string
): { ok: true; payload: Record<string, unknown> | null } | { ok: false; response: Response } => {
  if (text.trim() === '') return { ok: true, payload: null };

  const parsed = RequestValidator.parseJson(text);
  if (!parsed.ok) {
    let message = parsed.error.message;
    if (parsed.error.code === 'INVALID_JSON') {
      message = 'Invalid JSON body';
    } else if (parsed.error.code === 'VALIDATION_ERROR') {
      message = 'Invalid body';
    }
    return { ok: false, response: toErrorResponse(400, parsed.error.code, message) };
  }

  return { ok: true, payload: parsed.value };
};

const loadSigningSecret = (env: ProxyRequestEnv, secretEnvVar: string): string | null => {
  const directValue = getEnvValue(env, secretEnvVar);
  const direct = isString(directValue) ? directValue.trim() : '';
  if (direct !== '') return direct;

  const fallbackValue = getEnvValue(env, 'APP_KEY');
  const fallback = isString(fallbackValue) ? fallbackValue.trim() : '';
  if (fallback !== '') return fallback;

  return null;
};

export const verifyNonceKv = async (
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

export const verifySignedRequest = async (
  request: Request,
  env: ProxyRequestEnv,
  bodyBytes: Uint8Array,
  options: SignedRequestOptions
): Promise<Response | { ok: true }> => {
  const secret = loadSigningSecret(env, options.secretEnvVar);
  if (secret === null) {
    return toErrorResponse(
      options.missingSecretStatus,
      'CONFIG_ERROR',
      options.missingSecretMessage
    );
  }

  const windowMs = getEnvInt(env, 'ZT_PROXY_SIGNING_WINDOW_MS', options.defaultSigningWindowMs);
  const nonceStore = getEnvValue(env, 'ZT_NONCES');
  const verifyResult = await SigningService.verifyWithKeyProvider({
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
  });

  if (!verifyResult.ok) {
    return toErrorResponse(verifyResult.status, verifyResult.code, verifyResult.message);
  }

  return { ok: true };
};

export const readAndVerifyJson = async (
  request: Request,
  env: ProxyRequestEnv,
  options: ReadAndVerifyJsonOptions
): Promise<
  | { ok: true; payload: Record<string, unknown> | null; bodyBytes: Uint8Array }
  | { ok: false; response: Response }
> => {
  const maxBodyBytes = getEnvInt(env, 'ZT_MAX_BODY_BYTES', options.defaultMaxBodyBytes);
  const bodyResult = await readBodyBytes(request, maxBodyBytes);
  if (!bodyResult.ok) return { ok: false, response: bodyResult.response };

  const auth = await verifySignedRequest(request, env, bodyResult.bytes, options);
  if (auth instanceof Response) return { ok: false, response: auth };

  const parsed = parseOptionalJson(bodyResult.text);
  if (!parsed.ok) return { ok: false, response: parsed.response };

  return { ok: true, payload: parsed.payload, bodyBytes: bodyResult.bytes };
};
