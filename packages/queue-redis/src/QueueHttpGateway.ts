import { Env } from '@zintrust/core/config';
import { ErrorFactory } from '@zintrust/core/errors';
import { Router, type IRouter } from '@zintrust/core/http';
import { Logger } from '@zintrust/core/logger';
import { SignedRequest } from '@zintrust/core/security';
import BullMQRedisQueue from './BullMQRedisQueue';

type QueueRpcAction = 'enqueue' | 'dequeue' | 'ack' | 'length' | 'drain';

type QueueRpcRequest = {
  action: QueueRpcAction;
  requestId: string;
  payload: Record<string, unknown>;
};

type QueueGatewaySettings = {
  basePath: string;
  keyId: string;
  secret: string;
  signingWindowMs: number;
  nonceTtlMs: number;
  middleware: ReadonlyArray<string>;
};

type RequestLike = {
  getBody?: () => unknown;
  body?: unknown;
  context?: Record<string, unknown>;
  getHeaders: () => Record<string, string | string[] | undefined>;
  getMethod: () => string;
  getPath: () => string;
};

type ResponseLike = {
  status: (status: number) => ResponseLike;
  json: (value: unknown) => void;
};

const nonces = new Map<string, number>();
const nowMs = (): number => Date.now();

const normalizePath = (value: string): string => {
  const trimmed = value.trim();
  if (trimmed === '') return '/api/_sys/queue/rpc';
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
};

const parseMiddleware = (value: string): ReadonlyArray<string> =>
  value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

const readSettings = (): QueueGatewaySettings => {
  const configuredSecret = Env.get('QUEUE_HTTP_PROXY_KEY', '').trim();
  const secret = configuredSecret === '' ? Env.APP_KEY : configuredSecret;

  return {
    basePath: normalizePath(Env.get('QUEUE_HTTP_PROXY_PATH', '/api/_sys/queue/rpc')),
    keyId: Env.get('QUEUE_HTTP_PROXY_KEY_ID', Env.APP_NAME || 'zintrust').trim(),
    secret,
    signingWindowMs: Env.getInt('QUEUE_HTTP_PROXY_MAX_SKEW_MS', 60000),
    nonceTtlMs: Env.getInt('QUEUE_HTTP_PROXY_NONCE_TTL_MS', 120000),
    middleware: parseMiddleware(Env.get('QUEUE_HTTP_PROXY_MIDDLEWARE', '')),
  };
};

const cleanupExpiredNonces = (): void => {
  const current = nowMs();
  for (const [nonceKey, expiresAt] of nonces.entries()) {
    if (expiresAt <= current) nonces.delete(nonceKey);
  }
};

const storeNonce = async (keyId: string, nonce: string, ttlMs: number): Promise<boolean> => {
  cleanupExpiredNonces();
  const nonceKey = `${keyId}:${nonce}`;
  if (nonces.has(nonceKey)) return false;
  nonces.set(nonceKey, nowMs() + Math.max(ttlMs, 1));
  return true;
};

const getBodyRecord = (req: RequestLike): Record<string, unknown> => {
  const body = req.getBody?.() ?? req.body;
  if (typeof body === 'object' && body !== null && !Array.isArray(body)) {
    return body as Record<string, unknown>;
  }
  return {};
};

const getRawBody = (req: RequestLike): string => {
  const rawText = req.context?.['rawBodyText'];
  if (typeof rawText === 'string') return rawText;
  return JSON.stringify(getBodyRecord(req));
};

const toIncomingHeaders = (req: RequestLike): Record<string, string | undefined> => {
  const headers = req.getHeaders();
  const normalize = (value: string | string[] | undefined): string | undefined =>
    Array.isArray(value) ? value.join(',') : value;

  return {
    'x-zt-key-id': normalize(headers['x-zt-key-id']),
    'x-zt-timestamp': normalize(headers['x-zt-timestamp']),
    'x-zt-nonce': normalize(headers['x-zt-nonce']),
    'x-zt-body-sha256': normalize(headers['x-zt-body-sha256']),
    'x-zt-signature': normalize(headers['x-zt-signature']),
  };
};

const sendFailure = (
  res: ResponseLike,
  requestId: string,
  status: number,
  code: string,
  message: string,
  details?: unknown
): void => {
  res.status(status).json({
    ok: false,
    requestId,
    result: null,
    error: { code, message, details },
  });
};

const sendSuccess = (res: ResponseLike, requestId: string, result: unknown): void => {
  res.status(200).json({ ok: true, requestId, result, error: null });
};

const readQueueName = (payload: Record<string, unknown>): string => {
  const value = payload['queue'];
  if (typeof value !== 'string' || value.trim() === '') {
    throw ErrorFactory.createValidationError('payload.queue is required');
  }
  return value.trim();
};

const executeAction = async (request: QueueRpcRequest): Promise<unknown> => {
  const queueName = readQueueName(request.payload);

  switch (request.action) {
    case 'enqueue': {
      const payload = request.payload['payload'];
      if (!payload || typeof payload !== 'object') {
        throw ErrorFactory.createValidationError('payload.payload is required for enqueue');
      }
      return BullMQRedisQueue.enqueue(queueName, payload as Record<string, unknown>);
    }
    case 'dequeue':
      return BullMQRedisQueue.dequeue(queueName);
    case 'ack': {
      const id = request.payload['id'];
      if (typeof id !== 'string' || id.trim() === '') {
        throw ErrorFactory.createValidationError('payload.id is required for ack');
      }
      await BullMQRedisQueue.ack(queueName, id);
      return null;
    }
    case 'length':
      return BullMQRedisQueue.length(queueName);
    case 'drain':
      await BullMQRedisQueue.drain(queueName);
      return null;
    default:
      throw ErrorFactory.createValidationError(`Unsupported action: ${String(request.action)}`);
  }
};

const verifyRequest = async (
  req: RequestLike,
  bodyText: string,
  settings: QueueGatewaySettings
): Promise<{ ok: true } | { ok: false; status: number; code: string; message: string }> => {
  if (settings.keyId.trim() === '' || settings.secret.trim() === '') {
    return {
      ok: false,
      code: 'CONFIG_ERROR',
      status: 500,
      message: 'Queue HTTP gateway signing credentials are not configured',
    };
  }

  const verifyResult = await SignedRequest.verify({
    method: req.getMethod(),
    url: new URL(req.getPath(), 'http://localhost'),
    body: bodyText,
    headers: toIncomingHeaders(req),
    nowMs: nowMs(),
    windowMs: settings.signingWindowMs,
    verifyNonce: async (keyId: string, nonce: string) => storeNonce(keyId, nonce, settings.nonceTtlMs),
    getSecretForKeyId: async (keyId: string) => (keyId === settings.keyId ? settings.secret : undefined),
  });

  if (verifyResult.ok === true) return { ok: true };

  const code = 'code' in verifyResult ? verifyResult.code : 'INVALID_SIGNATURE';
  const message = 'message' in verifyResult ? verifyResult.message : 'Invalid signature';
  return {
    ok: false,
    code,
    status: code === 'EXPIRED' || code === 'REPLAYED' ? 401 : 403,
    message,
  };
};

const createHandler = (settings: QueueGatewaySettings) => {
  return async (req: RequestLike, res: ResponseLike): Promise<void> => {
    const rawBody = getRawBody(req);
    const body = getBodyRecord(req);
    const requestId =
      typeof body['requestId'] === 'string' && body['requestId'].trim() !== ''
        ? body['requestId']
        : 'unknown';

    const auth = await verifyRequest(req, rawBody, settings);
    if (auth.ok === false) {
      sendFailure(res, requestId, auth.status, auth.code, auth.message);
      return;
    }

    if (typeof body['action'] !== 'string') {
      sendFailure(res, requestId, 400, 'VALIDATION_ERROR', 'action is required');
      return;
    }

    if (!body['payload'] || typeof body['payload'] !== 'object' || Array.isArray(body['payload'])) {
      sendFailure(res, requestId, 400, 'VALIDATION_ERROR', 'payload must be an object');
      return;
    }

    try {
      const result = await executeAction({
        action: body['action'] as QueueRpcAction,
        requestId,
        payload: body['payload'] as Record<string, unknown>,
      });
      sendSuccess(res, requestId, result);
    } catch (error) {
      Logger.error('Queue HTTP gateway action failed', error as Error);
      sendFailure(res, requestId, 500, 'QUEUE_ERROR', 'Queue operation failed', {
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };
};

export const QueueHttpGateway = Object.freeze({
  create(config?: Partial<QueueGatewaySettings>): { registerRoutes: (router: IRouter) => void } {
    const defaults = readSettings();
    const settings = {
      ...defaults,
      ...config,
      basePath: normalizePath(config?.basePath ?? defaults.basePath),
    };
    const routeOptions =
      settings.middleware.length > 0 ? { middleware: settings.middleware } : undefined;

    return {
      registerRoutes(router: IRouter): void {
        Router.post(router, settings.basePath, createHandler(settings), routeOptions);
      },
    };
  },
});

export default QueueHttpGateway;
