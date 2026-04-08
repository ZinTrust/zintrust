import { SystemTraceBridge } from '@/trace/SystemTraceBridge';
import { isObject, isString } from '@helper/index';
import {
  getEnvInt,
  json,
  normalizeBindingName,
  readAndVerifyJson,
  toErrorResponse,
} from '@proxy/CloudflareProxyShared';
import { RequestValidator } from '@proxy/RequestValidator';

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
    (key: string, type: 'json'): Promise<Record<string, unknown> | null>;
    (key: string, type: 'arrayBuffer'): Promise<ArrayBuffer | null>;
    (key: string, type: KvGetType): Promise<Record<string, unknown> | ArrayBuffer | string | null>;
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
  const prefix = isString(env.ZT_KV_PREFIX) ? env.ZT_KV_PREFIX : '';
  const namespace = normalizeNamespace(params.namespace);

  const parts: string[] = [];
  if (prefix.trim() !== '') parts.push(prefix.trim());
  if (namespace !== undefined) parts.push(namespace);
  parts.push(params.key);

  return parts.join(':');
};

const resolveCacheRequest = async (
  request: Request,
  env: KvEnv
): Promise<
  | { ok: true; cache: KVNamespace; payload: Record<string, unknown> | null }
  | { ok: false; response: Response }
> => {
  const check = await readAndVerifyJson(request, env, {
    secretEnvVar: 'KV_REMOTE_SECRET',
    missingSecretStatus: 500,
    missingSecretMessage: 'Missing signing secret (KV_REMOTE_SECRET or APP_KEY)',
    defaultSigningWindowMs: DEFAULT_SIGNING_WINDOW_MS,
    defaultMaxBodyBytes: DEFAULT_MAX_BODY_BYTES,
  });
  if (!check.ok) return { ok: false, response: check.response };

  const cache = requireCache(env);
  if (cache instanceof Response) return { ok: false, response: cache };

  return { ok: true, cache, payload: check.payload };
};

const parseGetPayload = (
  payload: unknown
):
  | { ok: true; namespace?: string; key: string; type: KvGetType }
  | { ok: false; response: Response } => {
  if (!isObject(payload)) {
    return { ok: false, response: toErrorResponse(400, 'VALIDATION_ERROR', 'Invalid body') };
  }

  const key = payload['key'];
  const type = payload['type'];

  if (!isString(key) || key.trim() === '') {
    return { ok: false, response: toErrorResponse(400, 'VALIDATION_ERROR', 'key is required') };
  }

  const typeValue: KvGetType =
    type === 'text' || type === 'arrayBuffer' || type === 'json' ? type : 'text';
  return { ok: true, namespace: normalizeNamespace(payload['namespace']), key, type: typeValue };
};

const handleGet = async (request: Request, env: KvEnv): Promise<Response> => {
  const resolved = await resolveCacheRequest(request, env);
  if (!resolved.ok) return resolved.response;

  const parsed = parseGetPayload(resolved.payload);
  if (!parsed.ok) return parsed.response;

  const storageKey = buildStorageKey(env, { namespace: parsed.namespace, key: parsed.key });
  const startedAt = Date.now();

  if (parsed.type === 'json') {
    const value = await resolved.cache.get(storageKey, 'json');
    SystemTraceBridge.emitCache(
      'get',
      storageKey,
      Date.now() - startedAt,
      value !== null,
      value,
      'kv-proxy'
    );
    return json(200, { value: value ?? null });
  }

  if (parsed.type === 'arrayBuffer') {
    const value = await resolved.cache.get(storageKey, 'arrayBuffer');
    SystemTraceBridge.emitCache(
      'get',
      storageKey,
      Date.now() - startedAt,
      value !== null,
      value,
      'kv-proxy'
    );
    return json(200, { value: value ?? null });
  }

  const value = await resolved.cache.get(storageKey);
  SystemTraceBridge.emitCache(
    'get',
    storageKey,
    Date.now() - startedAt,
    value !== null,
    value,
    'kv-proxy'
  );
  return json(200, { value: value ?? null });
};

const parsePutPayload = (
  payload: unknown
):
  | { ok: true; namespace?: string; key: string; value: unknown; ttlSeconds?: number }
  | { ok: false; response: Response } => {
  if (!isObject(payload)) {
    return { ok: false, response: toErrorResponse(400, 'VALIDATION_ERROR', 'Invalid body') };
  }

  const key = payload['key'];
  if (!isString(key) || key.trim() === '') {
    return { ok: false, response: toErrorResponse(400, 'VALIDATION_ERROR', 'key is required') };
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
  const resolved = await resolveCacheRequest(request, env);
  if (!resolved.ok) return resolved.response;

  const parsed = parsePutPayload(resolved.payload);
  if (!parsed.ok) return parsed.response;

  const storageKey = buildStorageKey(env, { namespace: parsed.namespace, key: parsed.key });
  const value = JSON.stringify(parsed.value);
  const startedAt = Date.now();

  const options: KVNamespacePutOptions = {};
  if (parsed.ttlSeconds !== undefined) {
    options.expirationTtl = Math.floor(parsed.ttlSeconds);
  }

  await resolved.cache.put(storageKey, value, options);
  SystemTraceBridge.emitCache(
    'set',
    storageKey,
    Date.now() - startedAt,
    undefined,
    parsed.value,
    'kv-proxy',
    parsed.ttlSeconds
  );
  return json(200, { ok: true });
};

const parseDeletePayload = (
  payload: unknown
): { ok: true; namespace?: string; key: string } | { ok: false; response: Response } => {
  if (!isObject(payload)) {
    return { ok: false, response: toErrorResponse(400, 'VALIDATION_ERROR', 'Invalid body') };
  }

  const key = payload['key'];
  if (!isString(key) || key.trim() === '') {
    return { ok: false, response: toErrorResponse(400, 'VALIDATION_ERROR', 'key is required') };
  }

  return { ok: true, namespace: normalizeNamespace(payload['namespace']), key };
};

const handleDelete = async (request: Request, env: KvEnv): Promise<Response> => {
  const resolved = await resolveCacheRequest(request, env);
  if (!resolved.ok) return resolved.response;

  const parsed = parseDeletePayload(resolved.payload);
  if (!parsed.ok) return parsed.response;

  const storageKey = buildStorageKey(env, { namespace: parsed.namespace, key: parsed.key });
  const startedAt = Date.now();
  await resolved.cache.delete(storageKey);
  SystemTraceBridge.emitCache(
    'delete',
    storageKey,
    Date.now() - startedAt,
    undefined,
    undefined,
    'kv-proxy'
  );
  return json(200, { ok: true });
};

const parseListPayload = (
  payload: unknown
): { ok: true; params: ListRequest } | { ok: false; response: Response } => {
  if (payload === null) return { ok: true, params: {} };
  if (!isObject(payload)) {
    return { ok: false, response: toErrorResponse(400, 'VALIDATION_ERROR', 'Invalid body') };
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
  const resolved = await resolveCacheRequest(request, env);
  if (!resolved.ok) return resolved.response;

  const parsed = parseListPayload(resolved.payload);
  if (!parsed.ok) return parsed.response;

  const envLimit = getEnvInt(env, 'ZT_KV_LIST_LIMIT', DEFAULT_LIST_LIMIT);
  const requested = parsed.params.limit ?? envLimit;
  const limit = Math.max(1, Math.min(requested, envLimit));

  const prefixKey = parsed.params.prefix;
  const namespacePrefix = normalizeNamespace(parsed.params.namespace);
  const basePrefix = buildStorageKey(env, { namespace: namespacePrefix, key: '' });
  const fullPrefix = prefixKey === undefined ? basePrefix : `${basePrefix}${prefixKey}`;

  const out = await resolved.cache.list({
    prefix: fullPrefix,
    limit,
    cursor: parsed.params.cursor,
  });

  SystemTraceBridge.emitEvent('kv-proxy.list', 1, {
    prefix: fullPrefix,
    limit,
    cursor: parsed.params.cursor,
  });

  return json(200, {
    keys: out.keys.map((key) => key.name),
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
