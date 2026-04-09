import { SystemTraceWorkerBridge } from '@/trace/SystemTraceWorkerBridge';
import {
  getEnvInt,
  json,
  normalizeBindingName,
  readAndVerifyJson,
  toErrorResponse,
} from '@proxy/CloudflareProxyShared';
import { RequestValidator } from '@proxy/RequestValidator';

type KvGetType = 'text' | 'json' | 'arrayBuffer';

type KVNamespacePutOptions = {
  expirationTtl?: number;
};

type KVNamespace = {
  get: {
    (key: string): Promise<string | null>;
    (key: string, type: 'json'): Promise<Record<string, unknown> | null>;
    (key: string, type: 'arrayBuffer'): Promise<ArrayBuffer | null>;
    (key: string, type: KvGetType): Promise<Record<string, unknown> | ArrayBuffer | string | null>;
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

type D1Env = {
  DB?: D1Database;
  D1_BINDING?: string;
  APP_KEY?: string;
  D1_REMOTE_SECRET?: string;
  ZT_PROXY_SIGNING_WINDOW_MS?: string;
  ZT_NONCES?: KVNamespace;
  ZT_PROXY_DEBUG?: string;
  ZT_MAX_BODY_BYTES?: string;
  ZT_MAX_SQL_BYTES?: string;
  ZT_MAX_PARAMS?: string;
  ZT_D1_STATEMENTS_JSON?: string;
};

const DEFAULT_SIGNING_WINDOW_MS = 60_000;
const DEFAULT_MAX_BODY_BYTES = 128 * 1024;
const DEFAULT_MAX_SQL_BYTES = 32 * 1024;
const DEFAULT_MAX_PARAMS = 256;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isString = (value: unknown): value is string => typeof value === 'string';

const isArray = (value: unknown): value is unknown[] => Array.isArray(value);

const isDebugEnabled = (env: D1Env): boolean => {
  const raw = env.ZT_PROXY_DEBUG;
  if (!isString(raw)) return false;
  const normalized = raw.trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes';
};

const safeErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (isString(error)) return error;
  try {
    return JSON.stringify(error);
  } catch {
    return 'Unknown D1 error';
  }
};

const logProxyError = (env: D1Env, context: Record<string, unknown>, error: unknown): void => {
  if (!isDebugEnabled(env)) return;
  try {
    // eslint-disable-next-line no-console
    console.error('[ZintrustD1Proxy] error', {
      ...context,
      message: safeErrorMessage(error).slice(0, 800),
    });
  } catch {
    // ignore logging failures in Workers proxy mode
  }
};

const resolveD1Binding = (env: D1Env): D1Database | null => {
  const candidates = ['DB', 'zintrust_db', normalizeBindingName(env.D1_BINDING)].filter(
    (value, index, values): value is string =>
      isString(value) && value.trim() !== '' && values.indexOf(value) === index
  );

  const record = env as unknown as Record<string, unknown>;
  for (const name of candidates) {
    const binding = record[name] as D1Database | undefined;
    if (binding !== undefined && binding !== null && typeof binding.prepare === 'function') {
      return binding;
    }
  }

  return null;
};

const loadStatements = (env: D1Env): Record<string, string> | null => {
  const raw = env.ZT_D1_STATEMENTS_JSON;
  if (!isString(raw) || raw.trim() === '') return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) return null;
    return parsed as Record<string, string>;
  } catch {
    return null;
  }
};

const isMutatingSql = (sql: string): boolean => {
  const normalized = sql.trimStart().toLowerCase();
  return (
    normalized.startsWith('insert') ||
    normalized.startsWith('update') ||
    normalized.startsWith('delete') ||
    normalized.startsWith('create') ||
    normalized.startsWith('drop') ||
    normalized.startsWith('alter') ||
    normalized.startsWith('replace')
  );
};

const requireDb = (env: D1Env): Response | D1Database => {
  const db = resolveD1Binding(env);
  if (db === null) {
    return toErrorResponse(
      400,
      'CONFIG_ERROR',
      'Missing D1 binding (DB) or binding name via D1_BINDING'
    );
  }
  return db;
};

const toD1ExceptionResponse = (error: unknown): Response => {
  const message = safeErrorMessage(error);
  return toErrorResponse(500, 'D1_ERROR', message);
};

const parseSqlPayload = (
  payload: unknown
): { ok: true; sql: string; params: unknown[] } | { ok: false; response: Response } => {
  if (!isRecord(payload)) {
    return { ok: false, response: toErrorResponse(400, 'VALIDATION_ERROR', 'Invalid body') };
  }

  const sql = payload['sql'];
  const params = payload['params'];
  if (!isString(sql)) {
    return {
      ok: false,
      response: toErrorResponse(400, 'VALIDATION_ERROR', 'sql must be a string'),
    };
  }
  return { ok: true, sql, params: isArray(params) ? params : [] };
};

const enforceSqlLimits = (env: D1Env, sql: string, params: unknown[]): Response | null => {
  const maxSqlBytes = getEnvInt(env, 'ZT_MAX_SQL_BYTES', DEFAULT_MAX_SQL_BYTES);
  const maxParams = getEnvInt(env, 'ZT_MAX_PARAMS', DEFAULT_MAX_PARAMS);

  if (new TextEncoder().encode(sql).byteLength > maxSqlBytes) {
    return toErrorResponse(413, 'PAYLOAD_TOO_LARGE', 'SQL too large');
  }
  if (params.length > maxParams) {
    return toErrorResponse(400, 'VALIDATION_ERROR', 'Too many params');
  }

  return null;
};

const resolveDbRequest = async (
  request: Request,
  env: D1Env
): Promise<
  | { ok: true; db: D1Database; payload: Record<string, unknown> | null }
  | { ok: false; response: Response }
> => {
  const check = await readAndVerifyJson(request, env, {
    secretEnvVar: 'D1_REMOTE_SECRET',
    missingSecretStatus: 401,
    missingSecretMessage: 'Missing signing secret (D1_REMOTE_SECRET or APP_KEY)',
    defaultSigningWindowMs: DEFAULT_SIGNING_WINDOW_MS,
    defaultMaxBodyBytes: DEFAULT_MAX_BODY_BYTES,
  });
  if (!check.ok) return { ok: false, response: check.response };

  const db = requireDb(env);
  if (db instanceof Response) return { ok: false, response: db };

  return { ok: true, db, payload: check.payload };
};

const resolveSqlRequest = async (
  request: Request,
  env: D1Env
): Promise<
  { ok: true; db: D1Database; sql: string; params: unknown[] } | { ok: false; response: Response }
> => {
  const resolved = await resolveDbRequest(request, env);
  if (!resolved.ok) return { ok: false, response: resolved.response };

  const parsed = parseSqlPayload(resolved.payload);
  if (!parsed.ok) return { ok: false, response: parsed.response };

  const limit = enforceSqlLimits(env, parsed.sql, parsed.params);
  if (limit !== null) return { ok: false, response: limit };

  return { ok: true, db: resolved.db, sql: parsed.sql, params: parsed.params };
};

const handleQuery = async (request: Request, env: D1Env): Promise<Response> => {
  try {
    const resolved = await resolveSqlRequest(request, env);
    if (!resolved.ok) return resolved.response;

    const startedAt = Date.now();
    const result = await resolved.db
      .prepare(resolved.sql)
      .bind(...resolved.params)
      .all<Record<string, unknown>>();
    SystemTraceWorkerBridge.emitQuery(
      resolved.sql,
      resolved.params,
      Date.now() - startedAt,
      'd1-proxy'
    );
    const rows = result.results ?? [];
    return json(200, { rows, rowCount: rows.length });
  } catch (error) {
    logProxyError(env, { op: 'query', path: '/zin/d1/query' }, error);
    return toD1ExceptionResponse(error);
  }
};

const handleQueryOne = async (request: Request, env: D1Env): Promise<Response> => {
  try {
    const resolved = await resolveSqlRequest(request, env);
    if (!resolved.ok) return resolved.response;

    const startedAt = Date.now();
    const row = await resolved.db
      .prepare(resolved.sql)
      .bind(...resolved.params)
      .first<Record<string, unknown>>();
    SystemTraceWorkerBridge.emitQuery(
      resolved.sql,
      resolved.params,
      Date.now() - startedAt,
      'd1-proxy'
    );
    return json(200, { row: row ?? null });
  } catch (error) {
    logProxyError(env, { op: 'queryOne', path: '/zin/d1/queryOne' }, error);
    return toD1ExceptionResponse(error);
  }
};

const handleExec = async (request: Request, env: D1Env): Promise<Response> => {
  try {
    const resolved = await resolveSqlRequest(request, env);
    if (!resolved.ok) return resolved.response;

    const startedAt = Date.now();
    const out = await resolved.db
      .prepare(resolved.sql)
      .bind(...resolved.params)
      .run();
    SystemTraceWorkerBridge.emitQuery(
      resolved.sql,
      resolved.params,
      Date.now() - startedAt,
      'd1-proxy'
    );
    return json(200, { ok: true, meta: out.meta });
  } catch (error) {
    logProxyError(env, { op: 'exec', path: '/zin/d1/exec' }, error);
    return toD1ExceptionResponse(error);
  }
};

const parseStatementPayload = (
  payload: unknown
): { ok: true; statementId: string; params: unknown[] } | { ok: false; response: Response } => {
  if (!isRecord(payload)) {
    return { ok: false, response: toErrorResponse(400, 'VALIDATION_ERROR', 'Invalid body') };
  }

  const statementId = payload['statementId'];
  const params = payload['params'];
  if (!isString(statementId) || statementId.trim() === '') {
    return {
      ok: false,
      response: toErrorResponse(400, 'VALIDATION_ERROR', 'statementId must be a string'),
    };
  }

  return { ok: true, statementId, params: isArray(params) ? params : [] };
};

const handleStatement = async (request: Request, env: D1Env): Promise<Response> => {
  try {
    const resolved = await resolveDbRequest(request, env);
    if (!resolved.ok) return resolved.response;

    const statements = loadStatements(env);
    if (statements === null) {
      return toErrorResponse(400, 'CONFIG_ERROR', 'Missing or invalid ZT_D1_STATEMENTS_JSON');
    }

    const parsed = parseStatementPayload(resolved.payload);
    if (!parsed.ok) return parsed.response;

    const sql = statements[parsed.statementId];
    if (!isString(sql) || sql.trim() === '') {
      return toErrorResponse(404, 'NOT_FOUND', 'Unknown statementId');
    }

    const startedAt = Date.now();
    if (isMutatingSql(sql)) {
      const out = await resolved.db
        .prepare(sql)
        .bind(...parsed.params)
        .run();
      SystemTraceWorkerBridge.emitQuery(sql, parsed.params, Date.now() - startedAt, 'd1-proxy');
      return json(200, { ok: true, meta: out.meta });
    }

    const out = await resolved.db
      .prepare(sql)
      .bind(...parsed.params)
      .all<Record<string, unknown>>();
    SystemTraceWorkerBridge.emitQuery(sql, parsed.params, Date.now() - startedAt, 'd1-proxy');
    const rows = out.results ?? [];
    return json(200, { rows, rowCount: rows.length });
  } catch (error) {
    logProxyError(env, { op: 'statement', path: '/zin/d1/statement' }, error);
    return toD1ExceptionResponse(error);
  }
};

export const ZintrustD1Proxy = Object.freeze({
  _ZINTRUST_CLOUDFLARE_D1_PROXY_VERSION: '0.1.15',
  _ZINTRUST_CLOUDFLARE_D1_PROXY_BUILD_DATE: '__BUILD_DATE__',
  async fetch(request: Request, env: D1Env): Promise<Response> {
    const url = new URL(request.url);

    const methodError = RequestValidator.requirePost(request.method);
    if (methodError !== null) {
      return toErrorResponse(405, methodError.code, 'Method not allowed');
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
        return toErrorResponse(404, 'NOT_FOUND', 'Not found');
    }
  },
});

export default ZintrustD1Proxy;
