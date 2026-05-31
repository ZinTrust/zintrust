import { isObject } from '@zintrust/core/helper';
import { Logger } from '@zintrust/core/runtime';
import http from 'node:http';
import { createRedisRpcBackend } from './backend';
import { rpcServerOptions } from './env';
import { createRpcNotFoundError, createRpcUnauthorizedError, toErrorPayload } from './errors';
import type { RedisRpcServerInstance, RpcRequest } from './types';

type RequestContext = Readonly<{
  method: string;
  url: URL;
  headerSecret: string;
  settingsSecret: string;
}>;

const readBody = async (request: http.IncomingMessage): Promise<string> => {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf8');
};

const json = (response: http.ServerResponse, status: number, payload: unknown): void => {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  response.end(JSON.stringify(payload));
};

const getHeaderSecret = (request: http.IncomingMessage): string => {
  const raw = request.headers['x-redis-rpc-secret'];
  if (Array.isArray(raw)) {
    return raw[0] ?? '';
  }

  return typeof raw === 'string' ? raw : '';
};

const previewSecret = (value: string): string => value.slice(0, 5);

const logStep = (step: string, details: Record<string, unknown>): void => {
  Logger.debug(`[redis-rpc][server] ${step}`, details);
};

const getRequestContext = (
  request: http.IncomingMessage,
  settings: { secret: string }
): RequestContext => {
  const method = request.method ?? '';
  const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
  const headerSecret = getHeaderSecret(request);
  const settingsSecret = settings.secret || '';

  return {
    method,
    url,
    headerSecret,
    settingsSecret,
  };
};

const logRequestReceived = (context: RequestContext): void => {
  logStep('request.received', {
    method: context.method,
    path: context.url.pathname,
    host: context.url.host,
    headerSecretPreview: previewSecret(context.headerSecret),
    settingsSecretPreview: previewSecret(context.settingsSecret),
  });
};

const isHealthRoute = (context: RequestContext): boolean =>
  context.method === 'GET' && context.url.pathname === '/health';

const isRpcRoute = (context: RequestContext): boolean =>
  context.method === 'POST' && context.url.pathname === '/rpc';

const logHealthRoute = (prefix: string, path: string): void => {
  logStep('route.health', {
    path,
    prefix,
  });
};

const logRouteCheck = (context: RequestContext): void => {
  logStep('route.check', {
    method: context.method,
    path: context.url.pathname,
    isRpcRoute: isRpcRoute(context),
  });
};

const logRouteNotFound = (context: RequestContext): void => {
  logStep('route.notFound', {
    method: context.method,
    path: context.url.pathname,
  });
};

const validateRequestSecret = (context: RequestContext): boolean => {
  logStep('secret.validate.start', {
    headerSecretPreview: previewSecret(context.headerSecret),
    settingsSecretPreview: previewSecret(context.settingsSecret),
  });

  const secretMatches =
    context.settingsSecret !== '' && context.headerSecret === context.settingsSecret;

  logStep('secret.validate.result', {
    headerSecretPreview: previewSecret(context.headerSecret),
    settingsSecretPreview: previewSecret(context.settingsSecret),
    secretMatches,
  });

  return secretMatches;
};

const logSecretValidationFailure = (context: RequestContext): void => {
  logStep('secret.validate.failed', {
    headerSecretPreview: previewSecret(context.headerSecret),
    settingsSecretPreview: previewSecret(context.settingsSecret),
  });
};

const readRpcBody = async (request: http.IncomingMessage): Promise<Partial<RpcRequest>> => {
  logStep('body.read.start', {});
  const bodyText = await readBody(request);
  logStep('body.read.complete', {
    length: bodyText.length,
    isEmpty: bodyText.trim().length === 0,
  });

  try {
    const body = (bodyText.trim().length === 0 ? {} : JSON.parse(bodyText)) as Partial<RpcRequest>;
    logStep('body.parse.complete', {
      requestId: body.requestId ?? null,
      service: String(body.service || ''),
      method: String(body.method || ''),
      hasPayload: body.payload !== undefined,
    });
    return body;
  } catch (error) {
    logStep('body.parse.failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
};

const dispatchRpcRequest = async (
  backend: ReturnType<typeof createRedisRpcBackend>,
  body: Partial<RpcRequest>
): Promise<unknown> => {
  logStep('dispatch.start', {
    requestId: body.requestId ?? null,
    service: String(body.service || ''),
    method: String(body.method || ''),
  });

  const result = await backend.dispatch(
    String(body.service || ''),
    String(body.method || ''),
    body.payload ?? {}
  );

  logStep('dispatch.complete', {
    requestId: body.requestId ?? null,
    service: String(body.service || ''),
    method: String(body.method || ''),
  });

  return result;
};

const sendRpcSuccess = (
  response: http.ServerResponse,
  requestId: string | null,
  result: unknown
): void => {
  json(response, 200, { ok: true, requestId, result, error: null });
  logStep('response.sent', {
    status: 200,
    requestId,
  });
};

const handleRequestError = (response: http.ServerResponse, error: unknown): void => {
  const payload = toErrorPayload(error);
  logStep('request.error', {
    status: payload.status,
    message:
      payload.body && typeof payload.body === 'object' && 'message' in payload.body
        ? String((payload.body as { message?: unknown }).message ?? '')
        : '',
  });
  json(response, payload.status, payload.body);
};

const handleRpcRequest = async (
  request: http.IncomingMessage,
  response: http.ServerResponse,
  context: RequestContext,
  backend: ReturnType<typeof createRedisRpcBackend>
): Promise<void> => {
  logRouteCheck(context);

  if (!isRpcRoute(context)) {
    logRouteNotFound(context);
    throw createRpcNotFoundError('Unknown Redis RPC route');
  }

  if (!validateRequestSecret(context)) {
    logSecretValidationFailure(context);
    throw createRpcUnauthorizedError('Invalid Redis RPC secret');
  }

  const body = await readRpcBody(request);
  const result = await dispatchRpcRequest(backend, body);
  sendRpcSuccess(response, body.requestId ?? null, result);
};

const handleHealthRequest = (
  response: http.ServerResponse,
  backend: ReturnType<typeof createRedisRpcBackend>
): void => {
  logHealthRoute(backend.prefix, '/health');
  json(response, 200, { ok: true, service: 'redis-rpc', prefix: backend.prefix });
};

const handleIncomingRequest = async (
  request: http.IncomingMessage,
  response: http.ServerResponse,
  settings: { secret: string },
  backend: ReturnType<typeof createRedisRpcBackend>
): Promise<void> => {
  const context = getRequestContext(request, settings);
  logRequestReceived(context);

  if (isHealthRoute(context)) {
    handleHealthRequest(response, backend);
    return;
  }

  await handleRpcRequest(request, response, context, backend);
};

export const createRedisRpcServer = (
  options: Record<string, unknown> = {}
): RedisRpcServerInstance => {
  const settings = { ...rpcServerOptions(), ...options };
  const backend = isObject(options.backend)
    ? (options.backend as ReturnType<typeof createRedisRpcBackend>)
    : createRedisRpcBackend(settings);

  const server = http.createServer((request, response) => {
    void handleIncomingRequest(request, response, settings, backend).catch((error) => {
      handleRequestError(response, error);
    });
  });

  return { server, backend, settings };
};

export const listenRedisRpcServer = async (
  options: Record<string, unknown> = {}
): Promise<RedisRpcServerInstance> => {
  const created = createRedisRpcServer(options);
  await new Promise<void>((resolve) =>
    created.server.listen(created.settings.port, created.settings.host, resolve)
  );
  return created;
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const created = await listenRedisRpcServer();
  Logger.info(`redis-rpc listening on http://${created.settings.host}:${created.settings.port}`);

  const shutdown = async (): Promise<void> => {
    await created.backend.close();
    created.server.close(() => process.exit(0));
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}
