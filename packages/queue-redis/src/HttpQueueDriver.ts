import type { BullMQPayload, QueueMessage } from '@zintrust/core';
import {
  Env,
  ErrorFactory,
  JobStateTracker,
  SignedRequest,
  TimeoutManager,
  generateUuid,
} from '@zintrust/core';

export type QueueRpcAction = 'enqueue' | 'dequeue' | 'ack' | 'length' | 'drain';

type QueueRpcRequest = {
  action: QueueRpcAction;
  requestId: string;
  payload: Record<string, unknown>;
};

type QueueRpcError = {
  code?: string;
  message?: string;
  details?: unknown;
};

type QueueRpcResponse<T> = {
  ok: boolean;
  requestId?: string;
  result?: T;
  error?: QueueRpcError | null;
};

export interface IQueueDriver {
  enqueue(queue: string, payload: BullMQPayload): Promise<string>;
  dequeue<T = unknown>(queue: string): Promise<QueueMessage<T> | undefined>;
  ack(queue: string, id: string): Promise<void>;
  length(queue: string): Promise<number>;
  drain(queue: string): Promise<void>;
}

type HttpQueueDriverSettings = {
  baseUrl: string;
  routePath: string;
  keyId: string;
  secret: string;
  timeoutMs: number;
};

const DEFAULT_PROXY_URL = 'http://127.0.0.1:7772';
const DEFAULT_ROUTE_PATH = '/api/_sys/queue/rpc';

const createTimeoutSignal = (timeoutMs: number): AbortSignal | undefined => {
  if (timeoutMs <= 0) return undefined;
  const timeout = (AbortSignal as unknown as { timeout?: (ms: number) => AbortSignal }).timeout;
  return typeof timeout === 'function' ? timeout(timeoutMs) : undefined;
};

const toBodyText = (payload: Record<string, unknown>): string => JSON.stringify(payload);

const normalizeBaseUrl = (value: string): string => {
  const raw = value.trim();
  return raw === '' ? DEFAULT_PROXY_URL : raw;
};

const normalizeRoutePath = (value: string): string => {
  const trimmed = value.trim();
  if (trimmed === '') return DEFAULT_ROUTE_PATH;
  if (trimmed.startsWith('/')) return trimmed;
  return `/${trimmed}`;
};

const resolveSigningPrefix = (baseUrl: string): string | undefined => {
  try {
    const parsed = new URL(baseUrl);
    const path = parsed.pathname.endsWith('/') ? parsed.pathname.slice(0, -1) : parsed.pathname;
    if (path === '' || path === '/') return undefined;
    return path;
  } catch {
    return undefined;
  }
};

const buildSigningUrl = (requestUrl: URL, baseUrl: string): URL => {
  const prefix = resolveSigningPrefix(baseUrl);
  if (!prefix) return requestUrl;

  if (requestUrl.pathname === prefix || requestUrl.pathname.startsWith(`${prefix}/`)) {
    const signingUrl = new URL(requestUrl.toString());
    const stripped = requestUrl.pathname.slice(prefix.length);
    signingUrl.pathname = stripped.startsWith('/') ? stripped : `/${stripped}`;
    return signingUrl;
  }

  return requestUrl;
};

const resolveSettings = (): HttpQueueDriverSettings => {
  const baseUrl = normalizeBaseUrl(Env.get('QUEUE_HTTP_PROXY_URL', DEFAULT_PROXY_URL));
  const routePath = normalizeRoutePath(Env.get('QUEUE_HTTP_PROXY_PATH', DEFAULT_ROUTE_PATH));
  const keyId = Env.get('QUEUE_HTTP_PROXY_KEY_ID', Env.APP_NAME || 'zintrust').trim();
  const configuredSecret = Env.get('QUEUE_HTTP_PROXY_KEY', '').trim();
  const secret = configuredSecret === '' ? Env.APP_KEY : configuredSecret;
  const timeoutMs = Env.getInt('QUEUE_HTTP_PROXY_TIMEOUT_MS', 10000);

  if (secret.trim() === '') {
    throw ErrorFactory.createConfigError('QUEUE_HTTP_PROXY_KEY or APP_KEY is required');
  }

  return {
    baseUrl,
    routePath,
    keyId,
    secret,
    timeoutMs,
  };
};

const buildRpcUrl = (settings: HttpQueueDriverSettings): URL => {
  const url = new URL(settings.baseUrl);
  const basePath = url.pathname.endsWith('/') ? url.pathname.slice(0, -1) : url.pathname;
  const routePath = settings.routePath.startsWith('/')
    ? settings.routePath
    : `/${settings.routePath}`;
  url.pathname = `${basePath}${routePath}`;
  url.search = '';
  return url;
};

const parseJsonResponse = async <T>(response: Response): Promise<QueueRpcResponse<T>> => {
  const text = await response.text();
  if (text.trim() === '') {
    return {
      ok: false,
      error: { code: 'EMPTY_RESPONSE', message: 'Empty response from queue gateway' },
    };
  }

  try {
    return JSON.parse(text) as QueueRpcResponse<T>;
  } catch {
    return {
      ok: false,
      error: { code: 'INVALID_JSON', message: text },
    };
  }
};

const ensureSuccessfulResponse = <T>(response: QueueRpcResponse<T>, requestId: string): T => {
  if (!response.ok) {
    const code = response.error?.code || 'QUEUE_HTTP_PROXY_ERROR';
    const message = response.error?.message || 'Queue gateway returned an error';
    const details = {
      code,
      requestId,
      gatewayRequestId: response.requestId,
      details: response.error?.details,
    };
    throw ErrorFactory.createTryCatchError(message, details);
  }

  return response.result as T;
};

const callGateway = async <T>(
  action: QueueRpcAction,
  payload: Record<string, unknown>
): Promise<T> => {
  const settings = resolveSettings();
  const url = buildRpcUrl(settings);
  const requestId = generateUuid();
  const requestBody: QueueRpcRequest = {
    action,
    requestId,
    payload,
  };
  const bodyText = toBodyText(requestBody);
  const signingUrl = buildSigningUrl(url, settings.baseUrl);
  const params = {
    method: 'POST',
    url: signingUrl,
    body: bodyText,
    keyId: settings.keyId,
    secret: settings.secret,
  };

  const signedHeaders = await SignedRequest.createHeaders(params);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...signedHeaders,
      },
      body: bodyText,
      signal: createTimeoutSignal(settings.timeoutMs),
    });

    const parsed = await parseJsonResponse<T>(response);
    if (!response.ok && parsed.ok === false) {
      throw ErrorFactory.createConnectionError(
        parsed.error?.message || `Queue gateway HTTP error (${response.status})`,
        {
          status: response.status,
          requestId,
          error: parsed.error,
        }
      );
    }

    return ensureSuccessfulResponse(parsed, requestId);
  } catch (error: unknown) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw ErrorFactory.createConnectionError('Queue gateway request timed out', {
        timeoutMs: settings.timeoutMs,
        requestId,
      });
    }
    throw error;
  }
};

export const HttpQueueDriver = Object.freeze({
  async enqueue(queue: string, payload: BullMQPayload): Promise<string> {
    const fallbackJobId =
      typeof payload.uniqueId === 'string' && payload.uniqueId.trim().length > 0
        ? payload.uniqueId.trim()
        : generateUuid();
    const timeoutMs = Env.getInt('QUEUE_HTTP_PROXY_TIMEOUT_MS', 10000);

    try {
      return await TimeoutManager.withTimeoutRetry(
        async () => callGateway<string>('enqueue', { queue, payload }),
        {
          timeoutMs,
          maxRetries: Math.max(0, Env.getInt('QUEUE_HTTP_PROXY_RETRY_MAX', 2)),
          retryDelayMs: Math.max(0, Env.getInt('QUEUE_HTTP_PROXY_RETRY_DELAY_MS', 500)),
          operationName: `http-queue-enqueue:${queue}`,
        }
      );
    } catch (error) {
      await JobStateTracker.enqueued({
        queueName: queue,
        jobId: fallbackJobId,
        payload,
        maxAttempts:
          typeof payload.attempts === 'number' && Number.isFinite(payload.attempts)
            ? Math.max(1, Math.floor(payload.attempts))
            : undefined,
        idempotencyKey:
          typeof payload.uniqueId === 'string' && payload.uniqueId.trim().length > 0
            ? payload.uniqueId.trim()
            : undefined,
      });

      const pendingRecoveryApi = JobStateTracker as {
        pendingRecovery?: (input: {
          queueName: string;
          jobId: string;
          reason?: string;
          error?: unknown;
        }) => Promise<void>;
      };

      if (typeof pendingRecoveryApi.pendingRecovery === 'function') {
        await pendingRecoveryApi.pendingRecovery({
          queueName: queue,
          jobId: fallbackJobId,
          reason: 'HTTP queue proxy enqueue failed; marked pending recovery',
          error,
        });
      }

      return fallbackJobId;
    }
  },

  async dequeue<T = unknown>(queue: string): Promise<QueueMessage<T> | undefined> {
    return callGateway<QueueMessage<T> | undefined>('dequeue', { queue });
  },

  async ack(queue: string, id: string): Promise<void> {
    await callGateway<null>('ack', { queue, id });
  },

  async length(queue: string): Promise<number> {
    return callGateway<number>('length', { queue });
  },

  async drain(queue: string): Promise<void> {
    await callGateway<null>('drain', { queue });
  },
});

export default HttpQueueDriver;
