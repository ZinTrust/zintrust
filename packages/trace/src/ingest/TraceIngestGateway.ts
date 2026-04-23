import {
  Env,
  ErrorFactory,
  Router,
  SignedRequest,
  useDatabase,
  type IRequest,
  type IResponse,
  type IRouter,
  type RouteOptions,
} from '@zintrust/core';
import { TraceConfig } from '../config';
import { TraceStorage } from '../storage';
import type { ITraceEntry, ITraceStorage } from '../types';

type TraceIngestGatewaySettings = {
  basePath: string;
  keyId: string;
  secret: string;
  signingWindowMs: number;
  nonceTtlMs: number;
  middleware: ReadonlyArray<string>;
  storage: ITraceStorage;
};

type TraceIngestGatewayOverrides = Partial<
  Omit<TraceIngestGatewaySettings, 'storage'> & { storage: ITraceStorage; connectionName: string }
>;

type TraceGatewayFailure = {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

type TraceGatewaySuccess = {
  ok: true;
};

const nonces = new Map<string, number>();

const nowMs = (): number => Date.now();

const normalizePath = (value: string): string => {
  const trimmed = value.trim();
  if (trimmed === '') return '/zin/trace/write';
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
};

const parseMiddleware = (value: string): ReadonlyArray<string> =>
  value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

const appendSuffix = (path: string, suffix: string): string => {
  const base = normalizePath(path).replace(/\/+$/, '');
  const tail = suffix.startsWith('/') ? suffix : `/${suffix}`;
  return `${base}${tail}`;
};

const cleanupExpiredNonces = (): void => {
  const current = nowMs();
  for (const [nonceKey, expiresAt] of nonces.entries()) {
    if (expiresAt <= current) {
      nonces.delete(nonceKey);
    }
  }
};

const storeNonce = async (keyId: string, nonce: string, ttlMs: number): Promise<boolean> => {
  cleanupExpiredNonces();
  const nonceKey = `${keyId}:${nonce}`;
  if (nonces.has(nonceKey)) return false;
  nonces.set(nonceKey, nowMs() + Math.max(ttlMs, 1));
  return true;
};

const getBodyRecord = (req: IRequest): Record<string, unknown> => {
  const body = req.getBody?.() ?? req.body;
  if (typeof body === 'object' && body !== null && !Array.isArray(body)) {
    return body as Record<string, unknown>;
  }
  return {};
};

const getRawBody = (req: IRequest): string => {
  const rawText = req.context['rawBodyText'];
  if (typeof rawText === 'string') return rawText;
  return JSON.stringify(getBodyRecord(req));
};

const toIncomingHeaders = (req: IRequest): Record<string, string | undefined> => {
  const headers = req.getHeaders();
  const normalize = (value: string | string[] | undefined): string | undefined => {
    if (Array.isArray(value)) return value.join(',');
    return value;
  };

  return {
    'x-zt-key-id': normalize(headers['x-zt-key-id']),
    'x-zt-timestamp': normalize(headers['x-zt-timestamp']),
    'x-zt-nonce': normalize(headers['x-zt-nonce']),
    'x-zt-body-sha256': normalize(headers['x-zt-body-sha256']),
    'x-zt-signature': normalize(headers['x-zt-signature']),
  };
};

const sendFailure = (
  res: IResponse,
  status: number,
  code: string,
  message: string,
  details?: unknown
): void => {
  const payload: TraceGatewayFailure = {
    ok: false,
    error: { code, message, details },
  };
  res.status(status).json(payload);
};

const sendSuccess = (res: IResponse): void => {
  const payload: TraceGatewaySuccess = { ok: true };
  res.status(200).json(payload);
};

const verifyRequest = async (
  req: IRequest,
  bodyText: string,
  settings: TraceIngestGatewaySettings,
  path: string
): Promise<{ ok: true } | { ok: false; code: string; status: number; message: string }> => {
  if (settings.keyId.trim() === '' || settings.secret.trim() === '') {
    return {
      ok: false,
      code: 'CONFIG_ERROR',
      status: 500,
      message: 'Trace ingest signing credentials are not configured',
    };
  }

  const verifyResult = await SignedRequest.verify({
    method: req.getMethod(),
    url: new URL(path, 'http://localhost'),
    body: bodyText,
    headers: toIncomingHeaders(req),
    nowMs: nowMs(),
    windowMs: settings.signingWindowMs,
    verifyNonce: async (keyId: string, nonce: string) =>
      storeNonce(keyId, nonce, settings.nonceTtlMs),
    getSecretForKeyId: async (keyId: string) => {
      if (keyId === settings.keyId) return settings.secret;
      return undefined;
    },
  });

  if (verifyResult.ok === true) return { ok: true };

  return {
    ok: false,
    code: verifyResult.code,
    status: verifyResult.code === 'EXPIRED' || verifyResult.code === 'REPLAYED' ? 401 : 403,
    message: verifyResult.message,
  };
};

const createWriteHandler = (settings: TraceIngestGatewaySettings, path: string) => {
  return async (req: IRequest, res: IResponse): Promise<void> => {
    const body = getBodyRecord(req);
    const auth = await verifyRequest(req, getRawBody(req), settings, path);
    if (auth.ok === false) {
      sendFailure(res, auth.status, auth.code, auth.message);
      return;
    }

    const entry = body['entry'];
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      sendFailure(res, 400, 'VALIDATION_ERROR', 'entry must be an object');
      return;
    }

    await settings.storage.writeEntry(entry as ITraceEntry);
    sendSuccess(res);
  };
};

const createUpdateHandler = (settings: TraceIngestGatewaySettings, path: string) => {
  return async (req: IRequest, res: IResponse): Promise<void> => {
    const body = getBodyRecord(req);
    const auth = await verifyRequest(req, getRawBody(req), settings, path);
    if (auth.ok === false) {
      sendFailure(res, auth.status, auth.code, auth.message);
      return;
    }

    const uuid = body['uuid'];
    const patch = body['patch'];
    if (typeof uuid !== 'string' || uuid.trim() === '') {
      sendFailure(res, 400, 'VALIDATION_ERROR', 'uuid is required');
      return;
    }

    if (typeof patch !== 'object' || patch === null || Array.isArray(patch)) {
      sendFailure(res, 400, 'VALIDATION_ERROR', 'patch must be an object');
      return;
    }

    await settings.storage.updateEntry(
      uuid,
      patch as Partial<Pick<ITraceEntry, 'content' | 'isLatest'>>
    );
    sendSuccess(res);
  };
};

const createMarkFamilyStaleHandler = (settings: TraceIngestGatewaySettings, path: string) => {
  return async (req: IRequest, res: IResponse): Promise<void> => {
    const body = getBodyRecord(req);
    const auth = await verifyRequest(req, getRawBody(req), settings, path);
    if (auth.ok === false) {
      sendFailure(res, auth.status, auth.code, auth.message);
      return;
    }

    const familyHash = body['familyHash'];
    const exceptUuid = body['exceptUuid'];

    if (typeof familyHash !== 'string' || familyHash.trim() === '') {
      sendFailure(res, 400, 'VALIDATION_ERROR', 'familyHash is required');
      return;
    }

    if (typeof exceptUuid !== 'string' || exceptUuid.trim() === '') {
      sendFailure(res, 400, 'VALIDATION_ERROR', 'exceptUuid is required');
      return;
    }

    await settings.storage.markFamilyStale(familyHash, exceptUuid);
    sendSuccess(res);
  };
};

const resolveStorage = (overrides?: TraceIngestGatewayOverrides): ITraceStorage => {
  if (overrides?.storage !== undefined) return overrides.storage;

  const connectionName = overrides?.connectionName ?? TraceConfig.merge().connection;
  const db = useDatabase(undefined, connectionName);
  if (db === undefined) {
    throw ErrorFactory.createConfigError('Trace ingest connection is not configured.', {
      connectionName,
      envKey: 'TRACE_DB_CONNECTION',
    });
  }

  return TraceStorage.resolveStorage(db);
};

const readSettings = (overrides?: TraceIngestGatewayOverrides): TraceIngestGatewaySettings => {
  const configuredSecret = (overrides?.secret ?? Env.get('TRACE_PROXY_SECRET', '')).trim();
  const configuredKeyId = (overrides?.keyId ?? Env.get('TRACE_PROXY_KEY_ID', '')).trim();

  return {
    basePath: normalizePath(overrides?.basePath ?? Env.get('TRACE_PROXY_PATH', '/zin/trace/write')),
    keyId: configuredKeyId === '' ? (Env.APP_NAME || 'zintrust').trim() : configuredKeyId,
    secret: configuredSecret === '' ? Env.APP_KEY : configuredSecret,
    signingWindowMs:
      overrides?.signingWindowMs ?? Env.getInt('TRACE_PROXY_SIGNING_WINDOW_MS', 60000),
    nonceTtlMs: overrides?.nonceTtlMs ?? Env.getInt('TRACE_PROXY_NONCE_TTL_MS', 120000),
    middleware: overrides?.middleware ?? parseMiddleware(Env.get('TRACE_PROXY_MIDDLEWARE', '')),
    storage: resolveStorage(overrides),
  };
};

export const TraceIngestGateway = Object.freeze({
  create(overrides?: TraceIngestGatewayOverrides): {
    registerRoutes: (router: IRouter) => void;
  } {
    const settings = readSettings(overrides);
    const routeOptions: RouteOptions | undefined =
      settings.middleware.length > 0
        ? ({ middleware: settings.middleware } as RouteOptions)
        : undefined;
    const updatePath = appendSuffix(settings.basePath, '/update');
    const markFamilyStalePath = appendSuffix(settings.basePath, '/mark-family-stale');

    return {
      registerRoutes(router: IRouter): void {
        Router.post(
          router,
          settings.basePath,
          createWriteHandler(settings, settings.basePath),
          routeOptions
        );
        Router.post(router, updatePath, createUpdateHandler(settings, updatePath), routeOptions);
        Router.post(
          router,
          markFamilyStalePath,
          createMarkFamilyStaleHandler(settings, markFamilyStalePath),
          routeOptions
        );
      },
    };
  },
});

export const registerTraceIngestGateway = (
  router: IRouter,
  overrides?: TraceIngestGatewayOverrides
): void => {
  TraceIngestGateway.create(overrides).registerRoutes(router);
};

export default TraceIngestGateway;
