import { ErrorFactory, isUndefinedOrNull } from '@zintrust/core/runtime';
import { rpcClientHeaders, rpcServerOptions } from './env';
import type { RedisRpcClient, RedisRpcClientOptions, RpcPayload } from './types';

type RequestJsonResult = Readonly<{
  statusCode: number;
  ok: boolean;
  body: Record<string, unknown>;
}>;

const requestJson = async (url: URL, body: string, headers: Record<string, string>): Promise<RequestJsonResult> => {
  let response: Response;
  try {
    response = await fetch(url, { method: 'POST', headers, body });
  } catch (error) {
    throw ErrorFactory.createConnectionError('Redis RPC request failed', { error });
  }
  let text: string;
  try {
    text = await response.text();
  } catch (error) {
    throw ErrorFactory.createTryCatchError('Redis RPC response read failed', { error });
  }
  try {
    return {
      statusCode: response.status,
      ok: response.ok,
      body: isUndefinedOrNull(text.trim()) ? {} : JSON.parse(text),
    };
  } catch (error) {
    throw ErrorFactory.createTryCatchError('Redis RPC response parse failed', { error });
  }
};

const createServiceProxy = <TService extends object>(
  client: RedisRpcClient,
  service: string,
  target?: string
): TService => {
  return new Proxy(Object.create(null), {
    get(_receiver, property): unknown {
      if (typeof property !== 'string') return undefined;
      return (...args: unknown[]) => client.call(service, property, { target, args });
    },
  }) as TService;
};

export const createRedisRpcClient = (options: RedisRpcClientOptions = {}): RedisRpcClient => {
  const settings = rpcServerOptions();
  const baseUrl = options.baseUrl || `http://${settings.host}:${settings.port}`;
  const secret = options.secret ?? settings.secret;
  // Env-sourced headers are the baseline; options.headers merges on top (wins on collision).
  const resolvedHeaders: Record<string, string> = { ...rpcClientHeaders(), ...options.headers };

  const client: RedisRpcClient = Object.freeze({
    call: async <T = unknown>(service: string, method: string, payload: RpcPayload = {}): Promise<T> => {
      const url = new URL('/rpc', baseUrl);
      const body = JSON.stringify({
        requestId: globalThis.crypto.randomUUID(),
        service,
        method,
        payload,
      });
      const response = await requestJson(url, body, {
        'content-type': 'application/json',
        connection: 'close',
        ...(secret ? { 'x-redis-rpc-secret': secret } : {}),
        ...resolvedHeaders,
      });
      const parsed = response.body;
      if (!response.ok || parsed.ok !== true) {
        const error = parsed.error as { message?: string; code?: string; details?: unknown } | undefined;
        throw ErrorFactory.createTryCatchError(error?.message || `Redis RPC failed (${response.statusCode})`, {
          code: error?.code,
          details: error?.details,
        });
      }
      return parsed.result as T;
    },
    queue: (method, payload = {}) => client.call('queue', method, payload),
    worker: (method, payload = {}) => client.call('worker', method, payload),
    monitor: (method, payload = {}) => client.call('queue-monitor', method, payload),
    redis: (method, payload = {}) => client.call('redis', method, payload),
    service: (service, target) => createServiceProxy(client, service, target),
  });

  return client;
};
