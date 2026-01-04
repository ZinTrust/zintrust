import { SignedRequest } from './SignedRequest';

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

type KeysJson = Record<string, { secret: string }>;

type KvEnv = {
  CACHE?: KVNamespace;
  ZT_KEYS_JSON?: string;
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

const getEnvInt = (env: KvEnv, name: keyof KvEnv, fallback: number): number => {
  const raw = env[name];
  if (typeof raw !== 'string') return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isString = (value: unknown): value is string => typeof value === 'string';

const readBodyBytes = async (
  request: Request,
  maxBytes: number
): Promise<{ ok: true; bytes: Uint8Array; text: string } | { ok: false; response: Response }> => {
  const buf = await request.arrayBuffer();
  if (buf.byteLength > maxBytes) {
    return {
      ok: false,
      response: json(413, { code: 'PAYLOAD_TOO_LARGE', message: 'Body too large' }),
    };
  }

  const bytes = new Uint8Array(buf);
  const text = new TextDecoder().decode(bytes);
  return { ok: true, bytes, text };
};

const parseJsonOrNull = (text: string): unknown | null | { __error: 'INVALID_JSON' } => {
  if (text.trim() === '') return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { __error: 'INVALID_JSON' };
  }
};

const loadKeys = (env: KvEnv): KeysJson | null => {
  const raw = env.ZT_KEYS_JSON;
  if (typeof raw !== 'string' || raw.trim() === '') return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) return null;
    return parsed as KeysJson;
  } catch {
    return null;
  }
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
): Promise<Response | { ok: true; keyId: string }> => {
  const keys = loadKeys(env);
  if (keys === null) {
    return json(500, { code: 'CONFIG_ERROR', message: 'Missing or invalid ZT_KEYS_JSON' });
  }

  const windowMs = getEnvInt(env, 'ZT_PROXY_SIGNING_WINDOW_MS', DEFAULT_SIGNING_WINDOW_MS);

  const verifyResult = await SignedRequest.verify({
    method: request.method,
    url: request.url,
    body: bodyBytes,
    headers: request.headers,
    windowMs,
    getSecretForKeyId: async (keyId: string) => keys[keyId]?.secret,
    verifyNonce:
      env.ZT_NONCES === undefined
        ? undefined
        : async (keyId: string, nonce: string, ttlMs: number): Promise<boolean> =>
            verifyNonceKv(env.ZT_NONCES as KVNamespace, keyId, nonce, ttlMs),
  });

  if (!verifyResult.ok) {
    return json(401, { code: verifyResult.code, message: verifyResult.message });
  }

  return { ok: true, keyId: verifyResult.keyId };
};

const requireCache = (env: KvEnv): Response | KVNamespace => {
  if (env.CACHE === undefined) {
    return json(500, { code: 'CONFIG_ERROR', message: 'Missing KV binding (CACHE)' });
  }
  return env.CACHE;
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
  if (!bodyResult.ok) return bodyResult;

  const auth = await verifySignedRequest(request, env, bodyResult.bytes);
  if (auth instanceof Response) return { ok: false, response: auth };

  const parsed = parseJsonOrNull(bodyResult.text);
  if (isRecord(parsed) && parsed['__error'] === 'INVALID_JSON') {
    return {
      ok: false,
      response: json(400, { code: 'INVALID_JSON', message: 'Invalid JSON body' }),
    };
  }

  return { ok: true, payload: parsed, bodyBytes: bodyResult.bytes };
};

const parseGetPayload = (
  payload: unknown
):
  | { ok: true; namespace?: string; key: string; type: KvGetType }
  | { ok: false; response: Response } => {
  if (!isRecord(payload)) {
    return {
      ok: false,
      response: json(400, { code: 'VALIDATION_ERROR', message: 'Invalid body' }),
    };
  }

  const key = payload['key'];
  const type = payload['type'];

  if (!isString(key) || key.trim() === '') {
    return {
      ok: false,
      response: json(400, { code: 'VALIDATION_ERROR', message: 'key is required' }),
    };
  }

  const typeValue: KvGetType =
    type === 'text' || type === 'arrayBuffer' || type === 'json' ? type : 'text';
  return { ok: true, namespace: normalizeNamespace(payload['namespace']), key, type: typeValue };
};

const handleGet = async (request: Request, env: KvEnv): Promise<Response> => {
  const check = await readAndVerifyJson(request, env);
  if (!check.ok) return check.response;

  const cache = requireCache(env);
  if (cache instanceof Response) return cache;

  const parsed = parseGetPayload(check.payload);
  if (!parsed.ok) return parsed.response;

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
      response: json(400, { code: 'VALIDATION_ERROR', message: 'Invalid body' }),
    };
  }

  const key = payload['key'];
  if (!isString(key) || key.trim() === '') {
    return {
      ok: false,
      response: json(400, { code: 'VALIDATION_ERROR', message: 'key is required' }),
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
  if (!check.ok) return check.response;

  const cache = requireCache(env);
  if (cache instanceof Response) return cache;

  const parsed = parsePutPayload(check.payload);
  if (!parsed.ok) return parsed.response;

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
      response: json(400, { code: 'VALIDATION_ERROR', message: 'Invalid body' }),
    };
  }

  const key = payload['key'];
  if (!isString(key) || key.trim() === '') {
    return {
      ok: false,
      response: json(400, { code: 'VALIDATION_ERROR', message: 'key is required' }),
    };
  }

  return { ok: true, namespace: normalizeNamespace(payload['namespace']), key };
};

const handleDelete = async (request: Request, env: KvEnv): Promise<Response> => {
  const check = await readAndVerifyJson(request, env);
  if (!check.ok) return check.response;

  const cache = requireCache(env);
  if (cache instanceof Response) return cache;

  const parsed = parseDeletePayload(check.payload);
  if (!parsed.ok) return parsed.response;

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
      response: json(400, { code: 'VALIDATION_ERROR', message: 'Invalid body' }),
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
  if (!check.ok) return check.response;

  const cache = requireCache(env);
  if (cache instanceof Response) return cache;

  const parsed = parseListPayload(check.payload);
  if (!parsed.ok) return parsed.response;

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
  async fetch(request: Request, env: KvEnv): Promise<Response> {
    const url = new URL(request.url);

    if (request.method !== 'POST') {
      return json(405, { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' });
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
        return json(404, { code: 'NOT_FOUND', message: 'Not found' });
    }
  },
});

export default ZintrustKvProxy;
