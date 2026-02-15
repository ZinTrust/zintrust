import { ErrorHandler, RequestValidator, SigningService } from '@zintrust/core/proxy';

type KVNamespacePutOptions = {
  expirationTtl?: number;
};

type KvGetType = 'text' | 'json' | 'arrayBuffer';

type KVListResult = {
  keys: Array<{ name: string }>;
  cursor: string;
  list_complete: boolean;
};

type KVNamespace = {
  get: {
    (key: string): Promise<string | null>;
    (key: string, type: 'json'): Promise<unknown | null>;
    (key: string, type: 'arrayBuffer'): Promise<ArrayBuffer | null>;
    (key: string, type: KvGetType): Promise<unknown | ArrayBuffer | string | null>;
  };
  put: (key: string, value: string, options?: KVNamespacePutOptions) => Promise<void>;
  delete: (key: string) => Promise<void>;
  list: (options: { prefix?: string; limit?: number; cursor?: string }) => Promise<KVListResult>;
};

type KvEnv = {
  CACHE?: KVNamespace;
  KV_NAMESPACE?: string;
  APP_KEY?: string;
  KV_REMOTE_SECRET?: string;
  ZT_PROXY_SIGNING_WINDOW_MS?: string;
  ZT_NONCES?: KVNamespace;
  ZT_MAX_BODY_BYTES?: string;
  ZT_KV_PREFIX?: string;
  ZT_KV_LIST_LIMIT?: string;
};

type ListRequest = {
  namespace?: string;
  prefix?: string;
  limit?: number;
  cursor?: string;
};

const DEFAULT_SIGNING_WINDOW_MS = 60_000;
const DEFAULT_MAX_BODY_BYTES = 128 * 1024;
const DEFAULT_LIST_LIMIT = 100;

const json = (status: number, body: unknown): Response => {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
};

const toErrorResponse = (status: number, code: string, message: string): Response => {
  const error = ErrorHandler.toProxyError(status, code, message);
  return json(error.status, error.body);
};

const getEnvInt = (env: KvEnv, name: keyof KvEnv, fallback: number): number => {
  const raw = env[name];
  if (typeof raw !== 'string') return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isString = (value: unknown): value is string => typeof value === 'string';

const normalizeBindingName = (value: unknown): string | null => {
  if (!isString(value)) return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
};

const readBodyBytes = async (
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

const parseOptionalJson = (
  text: string
): { ok: true; payload: Record<string, unknown> | null } | { ok: false; response: Response } => {
  if (text.trim() === '') return { ok: true, payload: null };

  const parsed = RequestValidator.parseJson(text);
  if (!parsed.ok) {
    // Type guard: we know parsed has 'error' property when ok is false
    const errorResult = parsed as { ok: false; error: Readonly<{ code: string; message: string }> };
    let message = errorResult.error.message;
    if (errorResult.error.code === 'INVALID_JSON') {
      message = 'Invalid JSON body';
    } else if (errorResult.error.code === 'VALIDATION_ERROR') {
      message = 'Invalid body';
    }
    return { ok: false, response: toErrorResponse(400, errorResult.error.code, message) };
  }

  // Type guard: we know parsed has 'value' property when ok is true
  const successResult = parsed as { ok: true; value: Record<string, unknown> };
  return { ok: true, payload: successResult.value };
};

const loadSigningSecret = (env: KvEnv): string | null => {
  const direct = typeof env.KV_REMOTE_SECRET === 'string' ? env.KV_REMOTE_SECRET.trim() : '';
  if (direct !== '') return direct;

  const fallback = typeof env.APP_KEY === 'string' ? env.APP_KEY.trim() : '';
  if (fallback !== '') return fallback;

  return null;
};

const verifyNonceKv = async (
  kv: KVNamespace,
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
  env: KvEnv,
  bodyBytes: Uint8Array
): Promise<Response | { ok: true }> => {
  const secret = loadSigningSecret(env);
  if (secret === null) {
    return toErrorResponse(
      500,
      'CONFIG_ERROR',
      'Missing signing secret (KV_REMOTE_SECRET or APP_KEY)'
    );
  }

  const windowMs = getEnvInt(env, 'ZT_PROXY_SIGNING_WINDOW_MS', DEFAULT_SIGNING_WINDOW_MS);

  const verifyResult = await SigningService.verifyWithKeyProvider({
    method: request.method,
    url: request.url,
    body: bodyBytes,
    headers: request.headers,
    windowMs,
    getSecretForKeyId: async (_keyId: string) => secret,
    verifyNonce:
      env.ZT_NONCES === undefined
        ? undefined
        : async (keyId: string, nonce: string, ttlMs: number): Promise<boolean> =>
            verifyNonceKv(env.ZT_NONCES as KVNamespace, keyId, nonce, ttlMs),
  });

  if (verifyResult.ok === false) {
    return toErrorResponse(verifyResult.status, verifyResult.code, verifyResult.message);
  }

  return { ok: true };
};

const requireCache = (env: KvEnv): Response | KVNamespace => {
  if (env.CACHE !== undefined && env.CACHE !== null) return env.CACHE;

  const bindingName = normalizeBindingName(env.KV_NAMESPACE);
  if (bindingName !== null) {
    const record = env as unknown as Record<string, unknown>;
    const kv = record[bindingName] as KVNamespace | undefined;
    if (kv !== undefined && kv !== null) return kv;
  }

  return toErrorResponse(500, 'CONFIG_ERROR', 'Missing KV binding (CACHE)');
};

const normalizeNamespace = (value: unknown): string | undefined => {
  if (!isString(value)) return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
};

const buildStorageKey = (env: KvEnv, params: { namespace?: string; key: string }): string => {
  const prefix = typeof env.ZT_KV_PREFIX === 'string' ? env.ZT_KV_PREFIX : '';
  const ns = normalizeNamespace(params.namespace);

  const parts: string[] = [];
  if (prefix.trim() !== '') parts.push(prefix.trim());
  if (ns !== undefined) parts.push(ns);
  parts.push(params.key);

  return parts.join(':');
};

const readAndVerifyJson = async (
  request: Request,
  env: KvEnv
): Promise<
  { ok: true; payload: unknown | null; bodyBytes: Uint8Array } | { ok: false; response: Response }
> => {
  const maxBodyBytes = getEnvInt(env, 'ZT_MAX_BODY_BYTES', DEFAULT_MAX_BODY_BYTES);
  const bodyResult = await readBodyBytes(request, maxBodyBytes);
  if (bodyResult.ok === false) return { ok: false, response: bodyResult.response };

  const auth = await verifySignedRequest(request, env, bodyResult.bytes);
  if (auth instanceof Response) return { ok: false, response: auth };

  const parsed = parseOptionalJson(bodyResult.text);
  if (parsed.ok === false) return { ok: false, response: parsed.response };

  return { ok: true, payload: parsed.payload, bodyBytes: bodyResult.bytes };
};

const parseGetPayload = (
  payload: unknown
):
  | { ok: true; namespace?: string; key: string; type: KvGetType }
  | { ok: false; response: Response } => {
  if (!isRecord(payload)) {
    return {
      ok: false,
      response: toErrorResponse(400, 'VALIDATION_ERROR', 'Invalid body'),
    };
  }

  const key = payload['key'];
  const type = payload['type'];

  if (!isString(key) || key.trim() === '') {
    return {
      ok: false,
      response: toErrorResponse(400, 'VALIDATION_ERROR', 'key is required'),
    };
  }

  const typeValue: KvGetType =
    type === 'text' || type === 'arrayBuffer' || type === 'json' ? type : 'text';
  return { ok: true, namespace: normalizeNamespace(payload['namespace']), key, type: typeValue };
};

const handleGet = async (request: Request, env: KvEnv): Promise<Response> => {
  const check = await readAndVerifyJson(request, env);
  if (check.ok === false) return check.response;

  const cache = requireCache(env);
  if (cache instanceof Response) return cache;

  const parsed = parseGetPayload(check.payload);
  if (parsed.ok === false) return parsed.response;

  const storageKey = buildStorageKey(env, { namespace: parsed.namespace, key: parsed.key });

  if (parsed.type === 'json') {
    const value = await cache.get(storageKey, 'json');
    return json(200, { value: value ?? null });
  }

  if (parsed.type === 'arrayBuffer') {
    const value = await cache.get(storageKey, 'arrayBuffer');
    return json(200, { value: value ?? null });
  }

  const value = await cache.get(storageKey);
  return json(200, { value: value ?? null });
};

const parsePutPayload = (
  payload: unknown
):
  | { ok: true; namespace?: string; key: string; value: unknown; ttlSeconds?: number }
  | { ok: false; response: Response } => {
  if (!isRecord(payload)) {
    return {
      ok: false,
      response: toErrorResponse(400, 'VALIDATION_ERROR', 'Invalid body'),
    };
  }

  const key = payload['key'];
  if (!isString(key) || key.trim() === '') {
    return {
      ok: false,
      response: toErrorResponse(400, 'VALIDATION_ERROR', 'key is required'),
    };
  }

  const ttlSeconds = payload['ttlSeconds'];
  const ttl =
    typeof ttlSeconds === 'number' && Number.isFinite(ttlSeconds) && ttlSeconds > 0
      ? ttlSeconds
      : undefined;

  return {
    ok: true,
    namespace: normalizeNamespace(payload['namespace']),
    key,
    value: payload['value'],
    ttlSeconds: ttl,
  };
};

const handlePut = async (request: Request, env: KvEnv): Promise<Response> => {
  const check = await readAndVerifyJson(request, env);
  if (check.ok === false) return check.response;

  const cache = requireCache(env);
  if (cache instanceof Response) return cache;

  const parsed = parsePutPayload(check.payload);
  if (parsed.ok === false) return parsed.response;

  const storageKey = buildStorageKey(env, { namespace: parsed.namespace, key: parsed.key });
  const value = JSON.stringify(parsed.value);

  const options: KVNamespacePutOptions = {};
  if (parsed.ttlSeconds !== undefined) {
    options.expirationTtl = Math.floor(parsed.ttlSeconds);
  }

  await cache.put(storageKey, value, options);
  return json(200, { ok: true });
};

const parseDeletePayload = (
  payload: unknown
): { ok: true; namespace?: string; key: string } | { ok: false; response: Response } => {
  if (!isRecord(payload)) {
    return {
      ok: false,
      response: toErrorResponse(400, 'VALIDATION_ERROR', 'Invalid body'),
    };
  }

  const key = payload['key'];
  if (!isString(key) || key.trim() === '') {
    return {
      ok: false,
      response: toErrorResponse(400, 'VALIDATION_ERROR', 'key is required'),
    };
  }

  return { ok: true, namespace: normalizeNamespace(payload['namespace']), key };
};

const handleDelete = async (request: Request, env: KvEnv): Promise<Response> => {
  const check = await readAndVerifyJson(request, env);
  if (check.ok === false) return check.response;

  const cache = requireCache(env);
  if (cache instanceof Response) return cache;

  const parsed = parseDeletePayload(check.payload);
  if (parsed.ok === false) return parsed.response;

  const storageKey = buildStorageKey(env, { namespace: parsed.namespace, key: parsed.key });
  await cache.delete(storageKey);
  return json(200, { ok: true });
};

const parseListPayload = (
  payload: unknown
): { ok: true; params: ListRequest } | { ok: false; response: Response } => {
  if (payload === null) return { ok: true, params: {} };
  if (!isRecord(payload)) {
    return {
      ok: false,
      response: toErrorResponse(400, 'VALIDATION_ERROR', 'Invalid body'),
    };
  }

  const namespace = normalizeNamespace(payload['namespace']);
  const prefix = isString(payload['prefix']) ? payload['prefix'] : undefined;
  const cursor = isString(payload['cursor']) ? payload['cursor'] : undefined;

  const limitRaw = payload['limit'];
  const limitParsed =
    typeof limitRaw === 'number' && Number.isFinite(limitRaw) ? Math.floor(limitRaw) : undefined;

  return { ok: true, params: { namespace, prefix, cursor, limit: limitParsed } };
};

const handleList = async (request: Request, env: KvEnv): Promise<Response> => {
  const check = await readAndVerifyJson(request, env);
  if (check.ok === false) return check.response;

  const cache = requireCache(env);
  if (cache instanceof Response) return cache;

  const parsed = parseListPayload(check.payload);
  if (parsed.ok === false) return parsed.response;

  const envLimit = getEnvInt(env, 'ZT_KV_LIST_LIMIT', DEFAULT_LIST_LIMIT);
  const requested = parsed.params.limit ?? envLimit;
  const limit = Math.max(1, Math.min(requested, envLimit));

  const prefixKey = parsed.params.prefix;
  const nsPrefix = normalizeNamespace(parsed.params.namespace);
  const basePrefix = buildStorageKey(env, { namespace: nsPrefix, key: '' });
  const fullPrefix = prefixKey === undefined ? basePrefix : `${basePrefix}${prefixKey}`;

  const out = await cache.list({ prefix: fullPrefix, limit, cursor: parsed.params.cursor });

  return json(200, {
    keys: out.keys.map((k) => k.name),
    cursor: out.cursor,
    listComplete: out.list_complete,
  });
};

export const ZintrustKvProxy = Object.freeze({
  _ZINTRUST_CLOUDFLARE_KV_PROXY_VERSION: '0.1.15',
  _ZINTRUST_CLOUDFLARE_KV_PROXY_BUILD_DATE: '__BUILD_DATE__',
  async fetch(request: Request, env: KvEnv): Promise<Response> {
    const url = new URL(request.url);

    const methodError = RequestValidator.requirePost(request.method);
    if (methodError !== null) {
      return toErrorResponse(405, methodError.code, 'Method not allowed');
    }

    switch (url.pathname) {
      case '/zin/kv/get':
        return handleGet(request, env);
      case '/zin/kv/put':
        return handlePut(request, env);
      case '/zin/kv/delete':
        return handleDelete(request, env);
      case '/zin/kv/list':
        return handleList(request, env);
      default:
        return toErrorResponse(404, 'NOT_FOUND', 'Not found');
    }
  },
});

export default ZintrustKvProxy;
