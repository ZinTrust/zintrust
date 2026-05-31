import { isObject } from '@zintrust/core/helper';
import { Logger } from '@zintrust/core/runtime';
import http from 'node:http';
import { createRedisRpcBackend } from './backend';
import { rpcServerOptions } from './env';
import { createRpcNotFoundError, createRpcUnauthorizedError, toErrorPayload } from './errors';
import type { RedisRpcServerInstance, RpcRequest } from './types';

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

export const createRedisRpcServer = (options: Record<string, unknown> = {}): RedisRpcServerInstance => {
  const settings = { ...rpcServerOptions(), ...options };
  const backend = isObject(options.backend)
    ? options.backend as ReturnType<typeof createRedisRpcBackend>
    : createRedisRpcBackend(settings);

  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
      if (request.method === 'GET' && url.pathname === '/health') {
        json(response, 200, { ok: true, service: 'redis-rpc', prefix: backend.prefix });
        return;
      }
      if (request.method !== 'POST' || url.pathname !== '/rpc') {
        throw createRpcNotFoundError('Unknown Redis RPC route');
      }
      if (!settings.secret || request.headers['x-redis-rpc-secret'] !== settings.secret) {
        throw createRpcUnauthorizedError('Invalid Redis RPC secret');
      }
      const bodyText = await readBody(request);
      const body = (bodyText.trim().length === 0 ? {} : JSON.parse(bodyText)) as Partial<RpcRequest>;
      const result = await backend.dispatch(String(body.service || ''), String(body.method || ''), body.payload ?? {});
      json(response, 200, { ok: true, requestId: body.requestId ?? null, result, error: null });
    } catch (error) {
      const payload = toErrorPayload(error);
      json(response, payload.status, payload.body);
    }
  });

  return { server, backend, settings };
};

export const listenRedisRpcServer = async (options: Record<string, unknown> = {}): Promise<RedisRpcServerInstance> => {
  const created = createRedisRpcServer(options);
  await new Promise<void>((resolve) => created.server.listen(created.settings.port, created.settings.host, resolve));
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
