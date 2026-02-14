import type { BullMQPayload, IRequest, IResponse, IRouter, QueueMessage } from '@zintrust/core';
import { Env, ErrorFactory, Logger, Router, SignedRequest } from '@zintrust/core';
import BullMQRedisQueue, { runWithDirectQueueDriver } from './BullMQRedisQueue';

type QueueRpcAction = 'enqueue' | 'dequeue' | 'ack' | 'length' | 'drain';

type QueueRpcRequest = {
  action: QueueRpcAction;
  requestId: string;
  payload: {
    queue?: string;
    id?: string;
    payload?: BullMQPayload;
  };
};

type QueueRpcSuccess<T> = {
  ok: true;
  requestId: string;
  result: T;
  error: null;
};

type QueueRpcFailure = {
  ok: false;
  requestId: string;
  result: null;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

type QueueGatewaySettings = {
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
  requestId: string,
  status: number,
  code: string,
  message: string,
  details?: unknown
): void => {
  const payload: QueueRpcFailure = {
    ok: false,
    requestId,
    result: null,
    error: { code, message, details },
  };
  res.status(status).json(payload);
};

const sendSuccess = <T>(res: IResponse, requestId: string, result: T): void => {
  const payload: QueueRpcSuccess<T> = {
    ok: true,
    requestId,
    result,
    error: null,
  };
  res.status(200).json(payload);
};

const readQueueName = (payload: QueueRpcRequest['payload']): string | null => {
  const value = payload.queue;
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized === '' ? null : normalized;
};

const executeAction = async (request: QueueRpcRequest): Promise<unknown> => {
  return runWithDirectQueueDriver(async () => {
    const queueName = readQueueName(request.payload);

    if (!queueName) {
      throw ErrorFactory.createValidationError('payload.queue is required');
    }

    switch (request.action) {
      case 'enqueue': {
        const payload = request.payload.payload as BullMQPayload | undefined;
        if (!payload || typeof payload !== 'object') {
          throw ErrorFactory.createValidationError('payload.payload is required for enqueue');
        }
        return BullMQRedisQueue.enqueue(queueName, payload);
      }

      case 'dequeue':
        return BullMQRedisQueue.dequeue(queueName) as Promise<QueueMessage<unknown> | undefined>;

      case 'ack': {
        const id = request.payload.id;
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
  });
};

const verifyRequest = async (
  req: IRequest,
  bodyText: string,
  settings: QueueGatewaySettings
): Promise<{ ok: true } | { ok: false; code: string; status: number; message: string }> => {
  if (settings.keyId.trim() === '' || settings.secret.trim() === '') {
    return {
      ok: false,
      code: 'CONFIG_ERROR',
      status: 500,
      message: 'Queue HTTP gateway signing credentials are not configured',
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
    getSecretForKeyId: async (keyId) => {
      if (keyId === settings.keyId) return settings.secret;
      return undefined;
    },
  });

  if (verifyResult.ok === true) return { ok: true };

  const errorCode = 'code' in verifyResult ? verifyResult.code : 'INVALID_SIGNATURE';
  const errorMessage = 'message' in verifyResult ? verifyResult.message : 'Invalid signature';

  return {
    ok: false,
    code: errorCode,
    status: errorCode === 'EXPIRED' || errorCode === 'REPLAYED' ? 401 : 403,
    message: errorMessage,
  };
};

const createHandler = (settings: QueueGatewaySettings) => {
  return async (req: IRequest, res: IResponse): Promise<void> => {
    const rawBody = getRawBody(req);
    const body = getBodyRecord(req);
    const requestId =
      typeof body['requestId'] === 'string' && body['requestId'].trim() !== ''
        ? (body['requestId'] as string)
        : 'unknown';

    const auth = await verifyRequest(req, rawBody, settings);
    if (auth.ok === false) {
      sendFailure(res, requestId, auth.status, auth.code, auth.message);
      return;
    }

    const action = body['action'];
    const payload = body['payload'];

    if (typeof action !== 'string') {
      sendFailure(res, requestId, 400, 'VALIDATION_ERROR', 'action is required');
      return;
    }

    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      sendFailure(res, requestId, 400, 'VALIDATION_ERROR', 'payload must be an object');
      return;
    }

    const normalizedRequest: QueueRpcRequest = {
      action: action as QueueRpcAction,
      requestId,
      payload: payload as QueueRpcRequest['payload'],
    };

    try {
      const result = await executeAction(normalizedRequest);
      sendSuccess(res, requestId, result);
    } catch (error: unknown) {
      Logger.error('Queue HTTP gateway action failed', error as Error);
      sendFailure(
        res,
        requestId,
        500,
        'QUEUE_ERROR',
        'Queue operation failed',
        error instanceof Error ? { message: error.message } : error
      );
    }
  };
};

export const QueueHttpGateway = Object.freeze({
  create(config?: Partial<QueueGatewaySettings>): {
    registerRoutes: (router: IRouter) => void;
  } {
    const settings = {
      ...readSettings(),
      ...config,
      basePath: normalizePath(config?.basePath ?? readSettings().basePath),
    };

    const routeOptions: RouteOptions =
      settings.middleware.length > 0 ? { middleware: settings.middleware } : undefined;

    return {
      registerRoutes(router: IRouter): void {
        Router.post(router, settings.basePath, createHandler(settings), routeOptions);
      },
    };
  },
});

export default QueueHttpGateway;
