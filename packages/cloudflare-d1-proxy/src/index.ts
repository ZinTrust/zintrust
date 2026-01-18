import { SignedRequest } from './SignedRequest';

type KvGetType = 'text' | 'json' | 'arrayBuffer';

type KVNamespacePutOptions = {
  expirationTtl?: number;
};

type KVNamespace = {
  get: {
    (key: string): Promise<string | null>;
    (key: string, type: 'json'): Promise<unknown | null>;
    (key: string, type: 'arrayBuffer'): Promise<ArrayBuffer | null>;
    (key: string, type: KvGetType): Promise<unknown | ArrayBuffer | string | null>;
  };
  put: (key: string, value: string, options?: KVNamespacePutOptions) => Promise<void>;
};

type D1AllResult<T> = {
  results?: T[];
};

type D1RunResult = {
  meta?: unknown;
};

type D1PreparedStatement = {
  bind: (...values: unknown[]) => D1PreparedStatement;
  all: <T = unknown>() => Promise<D1AllResult<T>>;
  first: <T = unknown>() => Promise<T | null>;
  run: () => Promise<D1RunResult>;
};

type D1Database = {
  prepare: (sql: string) => D1PreparedStatement;
};

type KeysJson = Record<string, { secret: string }>;

type D1Env = {
  DB?: D1Database;
  ZT_KEYS_JSON?: string;
  ZT_PROXY_SIGNING_WINDOW_MS?: string;
  ZT_NONCES?: KVNamespace;
  ZT_MAX_BODY_BYTES?: string;
  ZT_MAX_SQL_BYTES?: string;
  ZT_MAX_PARAMS?: string;
  ZT_D1_STATEMENTS_JSON?: string;
};

const DEFAULT_SIGNING_WINDOW_MS = 60_000;
const DEFAULT_MAX_BODY_BYTES = 128 * 1024;
const DEFAULT_MAX_SQL_BYTES = 32 * 1024;
const DEFAULT_MAX_PARAMS = 256;

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });

const getEnvInt = (env: D1Env, name: keyof D1Env, fallback: number): number => {
  const raw = env[name];
  if (typeof raw !== 'string') return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isString = (value: unknown): value is string => typeof value === 'string';

const isArray = (value: unknown): value is unknown[] => Array.isArray(value);

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

const loadKeys = (env: D1Env): KeysJson | null => {
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

const loadStatements = (env: D1Env): Record<string, string> | null => {
  const raw = env.ZT_D1_STATEMENTS_JSON;
  if (typeof raw !== 'string' || raw.trim() === '') return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) return null;
    return parsed as Record<string, string>;
  } catch {
    return null;
  }
};

const isMutatingSql = (sql: string): boolean => {
  const s = sql.trimStart().toLowerCase();
  return (
    s.startsWith('insert') ||
    s.startsWith('update') ||
    s.startsWith('delete') ||
    s.startsWith('create') ||
    s.startsWith('drop') ||
    s.startsWith('alter') ||
    s.startsWith('replace')
  );
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
  env: D1Env,
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

  if (verifyResult.ok === false) {
    return json(401, { code: verifyResult.code, message: verifyResult.message });
  }

  return { ok: true, keyId: verifyResult.keyId };
};

const requireDb = (env: D1Env): Response | D1Database => {
  if (env.DB === undefined) {
    return json(500, { code: 'CONFIG_ERROR', message: 'Missing D1 binding (DB)' });
  }
  return env.DB;
};

const parseSqlPayload = (
  payload: unknown
): { ok: true; sql: string; params: unknown[] } | { ok: false; response: Response } => {
  if (!isRecord(payload)) {
    return {
      ok: false,
      response: json(400, { code: 'VALIDATION_ERROR', message: 'Invalid body' }),
    };
  }

  const sql = payload['sql'];
  const params = payload['params'];
  if (!isString(sql)) {
    return {
      ok: false,
      response: json(400, { code: 'VALIDATION_ERROR', message: 'sql must be a string' }),
    };
  }
  return { ok: true, sql, params: isArray(params) ? params : [] };
};

const enforceSqlLimits = (env: D1Env, sql: string, params: unknown[]): Response | null => {
  const maxSqlBytes = getEnvInt(env, 'ZT_MAX_SQL_BYTES', DEFAULT_MAX_SQL_BYTES);
  const maxParams = getEnvInt(env, 'ZT_MAX_PARAMS', DEFAULT_MAX_PARAMS);

  if (new TextEncoder().encode(sql).byteLength > maxSqlBytes) {
    return json(413, { code: 'PAYLOAD_TOO_LARGE', message: 'SQL too large' });
  }
  if (params.length > maxParams) {
    return json(400, { code: 'VALIDATION_ERROR', message: 'Too many params' });
  }

  return null;
};

const readAndVerifyJson = async (
  request: Request,
  env: D1Env
): Promise<
  { ok: true; payload: unknown | null; bodyBytes: Uint8Array } | { ok: false; response: Response }
> => {
  const maxBodyBytes = getEnvInt(env, 'ZT_MAX_BODY_BYTES', DEFAULT_MAX_BODY_BYTES);
  const bodyResult = await readBodyBytes(request, maxBodyBytes);
  if (bodyResult.ok === false) return { ok: false, response: bodyResult.response };

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

const handleQuery = async (request: Request, env: D1Env): Promise<Response> => {
  const check = await readAndVerifyJson(request, env);
  if (check.ok === false) return check.response;

  const db = requireDb(env);
  if (db instanceof Response) return db;

  const parsed = parseSqlPayload(check.payload);
  if (parsed.ok === false) return parsed.response;

  const limit = enforceSqlLimits(env, parsed.sql, parsed.params);
  if (limit !== null) return limit;

  const result = await db
    .prepare(parsed.sql)
    .bind(...parsed.params)
    .all<Record<string, unknown>>();
  const rows = result.results ?? [];
  return json(200, { rows, rowCount: rows.length });
};

const handleQueryOne = async (request: Request, env: D1Env): Promise<Response> => {
  const check = await readAndVerifyJson(request, env);
  if (check.ok === false) return check.response;

  const db = requireDb(env);
  if (db instanceof Response) return db;

  const parsed = parseSqlPayload(check.payload);
  if (parsed.ok === false) return parsed.response;

  const row = await db
    .prepare(parsed.sql)
    .bind(...parsed.params)
    .first<Record<string, unknown>>();
  return json(200, { row: row ?? null });
};

const handleExec = async (request: Request, env: D1Env): Promise<Response> => {
  const check = await readAndVerifyJson(request, env);
  if (check.ok === false) return check.response;

  const db = requireDb(env);
  if (db instanceof Response) return db;

  const parsed = parseSqlPayload(check.payload);
  if (parsed.ok === false) return parsed.response;

  const out = await db
    .prepare(parsed.sql)
    .bind(...parsed.params)
    .run();
  return json(200, { ok: true, meta: out.meta });
};

const parseStatementPayload = (
  payload: unknown
): { ok: true; statementId: string; params: unknown[] } | { ok: false; response: Response } => {
  if (!isRecord(payload)) {
    return {
      ok: false,
      response: json(400, { code: 'VALIDATION_ERROR', message: 'Invalid body' }),
    };
  }

  const statementId = payload['statementId'];
  const params = payload['params'];
  if (!isString(statementId) || statementId.trim() === '') {
    return {
      ok: false,
      response: json(400, { code: 'VALIDATION_ERROR', message: 'statementId must be a string' }),
    };
  }

  return { ok: true, statementId, params: isArray(params) ? params : [] };
};

const handleStatement = async (request: Request, env: D1Env): Promise<Response> => {
  const check = await readAndVerifyJson(request, env);
  if (check.ok === false) return check.response;

  const db = requireDb(env);
  if (db instanceof Response) return db;

  const statements = loadStatements(env);
  if (statements === null) {
    return json(500, { code: 'CONFIG_ERROR', message: 'Missing or invalid ZT_D1_STATEMENTS_JSON' });
  }

  const parsed = parseStatementPayload(check.payload);
  if (parsed.ok === false) return parsed.response;

  const sql = statements[parsed.statementId];
  if (!isString(sql) || sql.trim() === '') {
    return json(404, { code: 'NOT_FOUND', message: 'Unknown statementId' });
  }

  if (isMutatingSql(sql)) {
    const out = await db
      .prepare(sql)
      .bind(...parsed.params)
      .run();
    return json(200, { ok: true, meta: out.meta });
  }

  const out = await db
    .prepare(sql)
    .bind(...parsed.params)
    .all<Record<string, unknown>>();
  const rows = out.results ?? [];
  return json(200, { rows, rowCount: rows.length });
};

export const ZintrustD1Proxy = Object.freeze({
  async fetch(request: Request, env: D1Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method !== 'POST') {
      return json(405, { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' });
    }

    switch (url.pathname) {
      case '/zin/d1/query':
        return handleQuery(request, env);
      case '/zin/d1/queryOne':
        return handleQueryOne(request, env);
      case '/zin/d1/exec':
        return handleExec(request, env);
      case '/zin/d1/statement':
        return handleStatement(request, env);
      default:
        return json(404, { code: 'NOT_FOUND', message: 'Not found' });
    }
  },
});

export default ZintrustD1Proxy;

/**
 * Package version and build metadata
 * Available at runtime for debugging and health checks
 */
export const _ZINTRUST_CLOUDFLARE_D1_PROXY_VERSION = '0.1.15';
export const _ZINTRUST_CLOUDFLARE_D1_PROXY_BUILD_DATE = '__BUILD_DATE__';
