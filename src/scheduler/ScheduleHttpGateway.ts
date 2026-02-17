import { Env } from '@config/env';
import { Logger } from '@config/logger';
import type { IRouter } from '@core-routes/Router';
import { Router } from '@core-routes/Router';
import { ErrorFactory } from '@exceptions/ZintrustError';
import type { IRequest } from '@http/Request';
import type { IResponse } from '@http/Response';
import { SchedulerRuntime } from '@scheduler/SchedulerRuntime';
import type { ISchedule } from '@scheduler/types';
import { SignedRequest } from '@security/SignedRequest';

type ScheduleRpcAction = 'list' | 'run';

type PayLoad = { name: string | undefined } | undefined;

type ScheduleRpcRequest = {
  action: ScheduleRpcAction;
  requestId: string;
  payload?: PayLoad;
};

type RpcSuccess<T> = {
  ok: true;
  requestId: string;
  result: T;
  error: null;
};

type RpcFailure = {
  ok: false;
  requestId: string;
  result: null;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

type GatewaySettings = {
  basePath: string;
  keyId: string;
  secret: string;
  signingWindowMs: number;
  nonceTtlMs: number;
  middleware: ReadonlyArray<string>;
};

type RouteOptions = { middleware?: ReadonlyArray<string> } | undefined;

const nonces = new Map<string, number>();
const nowMs = (): number => Date.now();

const normalizePath = (value: string): string => {
  const trimmed = value.trim();
  if (trimmed === '') return '/api/_sys/schedule/rpc';
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
};

const parseMiddleware = (value: string): ReadonlyArray<string> =>
  value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

const readSettings = (): GatewaySettings => {
  const configuredSecret = Env.get('SCHEDULE_HTTP_PROXY_KEY', '').trim();
  const secret = configuredSecret === '' ? Env.APP_KEY : configuredSecret;

  return {
    basePath: normalizePath(Env.get('SCHEDULE_HTTP_PROXY_PATH', '/api/_sys/schedule/rpc')),
    keyId: Env.get('SCHEDULE_HTTP_PROXY_KEY_ID', Env.APP_NAME || 'zintrust').trim(),
    secret,
    signingWindowMs: Env.getInt('SCHEDULE_HTTP_PROXY_MAX_SKEW_MS', 60000),
    nonceTtlMs: Env.getInt('SCHEDULE_HTTP_PROXY_NONCE_TTL_MS', 120000),
    middleware: parseMiddleware(Env.get('SCHEDULE_HTTP_PROXY_MIDDLEWARE', '')),
  };
};

const cleanupExpiredNonces = (): void => {
  const current = nowMs();
  for (const [nonceKey, expiresAt] of nonces.entries()) {
    if (expiresAt <= current) nonces.delete(nonceKey);
  }
};

// eslint-disable-next-line @typescript-eslint/require-await
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
  const rawText = req.context?.['rawBodyText'];
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
    'x-zt-nonce': normalize(headers['x-zt-nonce']),
    'x-zt-timestamp': normalize(headers['x-zt-timestamp']),
    'x-zt-body-sha256': normalize(headers['x-zt-body-sha256']),
    'x-zt-signature': normalize(headers['x-zt-signature']),
    'content-type': normalize(headers['content-type']),
  };
};

const parseRequest = (req: IRequest): ScheduleRpcRequest => {
  const body = getBodyRecord(req);
  const action = String(body['action'] ?? '')
    .trim()
    .toLowerCase();
  const requestId = String(body['requestId'] ?? '').trim();

  if (requestId.length === 0) {
    throw ErrorFactory.createValidationError('requestId is required');
  }

  if (action !== 'list' && action !== 'run') {
    throw ErrorFactory.createValidationError('Invalid action');
  }

  const payload =
    typeof body['payload'] === 'object' && body['payload'] !== null
      ? (body['payload'] as PayLoad)
      : undefined;

  return {
    action: action as ScheduleRpcAction,
    requestId,
    payload,
  };
};

const ok = <T>(requestId: string, result: T): RpcSuccess<T> => ({
  ok: true,
  requestId,
  result,
  error: null,
});

const fail = (requestId: string, code: string, message: string, details?: unknown): RpcFailure => ({
  ok: false,
  requestId,
  result: null,
  error: { code, message, details },
});

const listSchedules = async (): Promise<
  Array<
    Pick<ISchedule, 'name' | 'intervalMs' | 'cron' | 'timezone' | 'enabled' | 'runOnStart'> & {
      state: {
        lastRunAt?: number;
        lastSuccessAt?: number;
        lastErrorAt?: number;
        lastErrorMessage?: string;
        nextRunAt?: number;
        consecutiveFailures?: number;
      } | null;
    }
  >
> => {
  const rows = await SchedulerRuntime.listWithState();
  return rows.map(({ schedule, state }) => ({
    name: schedule.name,
    intervalMs: schedule.intervalMs,
    cron: schedule.cron,
    timezone: schedule.timezone,
    enabled: schedule.enabled,
    runOnStart: schedule.runOnStart,
    state,
  }));
};

const verifyRequest = async (
  req: IRequest,
  bodyText: string,
  settings: GatewaySettings
): Promise<{ ok: true } | { ok: false; status: number; code: string; message: string }> => {
  if (settings.keyId.trim() === '' || settings.secret.trim() === '') {
    return {
      ok: false,
      status: 500,
      code: 'CONFIG_ERROR',
      message: 'Schedule HTTP gateway signing credentials are not configured',
    };
  }

  const url = new URL(req.getPath(), 'http://localhost');
  const verifyResult = await SignedRequest.verify({
    method: req.getMethod(),
    url,
    body: bodyText,
    headers: toIncomingHeaders(req),
    nowMs: nowMs(),
    windowMs: settings.signingWindowMs,
    verifyNonce: async (keyId, nonce) => storeNonce(keyId, nonce, settings.nonceTtlMs),
    getSecretForKeyId: (keyId) => {
      if (keyId === settings.keyId) return settings.secret;
      return undefined;
    },
  });

  if (verifyResult.ok === true) return { ok: true };

  const errorCode = 'code' in verifyResult ? verifyResult.code : 'INVALID_SIGNATURE';
  const errorMessage = 'message' in verifyResult ? verifyResult.message : 'Invalid signature';
  const status = errorCode === 'EXPIRED' || errorCode === 'REPLAYED' ? 401 : 403;

  return { ok: false, status, code: errorCode, message: errorMessage };
};

const handleRpc = async (req: IRequest, res: IResponse): Promise<void> => {
  const settings = readSettings();
  const rawBody = getRawBody(req);
  const body = getBodyRecord(req);
  const requestId =
    typeof body['requestId'] === 'string' && String(body['requestId']).trim() !== ''
      ? String(body['requestId'])
      : 'unknown';

  const auth = await verifyRequest(req, rawBody, settings);
  if (auth.ok === false) {
    res.status(auth.status).json(fail(requestId, auth.code, auth.message));
    return;
  }

  const parsed = parseRequest(req);

  try {
    if (parsed.action === 'list') {
      res.json(ok(parsed.requestId, await listSchedules()));
      return;
    }

    const name = String(parsed.payload?.name ?? '').trim();
    if (name.length === 0) {
      res.status(400).json(fail(parsed.requestId, 'VALIDATION_ERROR', 'payload.name is required'));
      return;
    }

    await SchedulerRuntime.runOnce(name);
    res.json(ok(parsed.requestId, { ran: true, name }));
  } catch (error) {
    Logger.error('Schedule RPC failed', error as Error);
    res.status(500).json(
      fail(parsed.requestId, 'INTERNAL_ERROR', 'Schedule RPC failed', {
        message: error instanceof Error ? error.message : String(error),
      })
    );
  }
};

export const ScheduleHttpGateway = Object.freeze({
  create(): { registerRoutes: (router: IRouter) => void } {
    const settings = readSettings();
    const options: RouteOptions =
      settings.middleware.length > 0 ? { middleware: settings.middleware } : undefined;

    return Object.freeze({
      registerRoutes(router: IRouter): void {
        Router.post(router, settings.basePath, handleRpc, options);
      },
    });
  },
});

export default ScheduleHttpGateway;
