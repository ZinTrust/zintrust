import type { RedisOptions } from 'ioredis';
import type http from 'node:http';
import type { RedisRpcRedisOptions, RedisRpcServerOptions } from './env';

export type RpcPayload = Record<string, unknown> & Readonly<{
  args?: unknown[];
  target?: string;
  queue?: string;
  queueName?: string;
}>;

export type RpcRequest = Readonly<{
  requestId?: string | null;
  service: string;
  method: string;
  payload?: RpcPayload;
}>;

export type RpcErrorBody = Readonly<{
  ok: false;
  error: Readonly<{
    code: string;
    message: string;
    details?: unknown;
  }>;
}>;

export type RpcSuccessBody<T = unknown> = Readonly<{
  ok: true;
  requestId: string | null;
  result: T;
  error: null;
}>;

export type RedisRpcBackendState = {
  prefix: string;
  connectionOptions: RedisRpcRedisOptions | RedisOptions;
};

export type RedisRpcServiceHandler = (input: Readonly<{
  method: string;
  payload: RpcPayload;
  backend: RedisRpcBackend;
}>) => Promise<unknown> ;

export type RedisRpcBackend = Readonly<{
  prefix: string;
  dispatch: (service: string, method: string, payload?: RpcPayload) => Promise<unknown>;
  registerService: (service: string, handler: RedisRpcServiceHandler) => void;
  close: () => Promise<void>;
}>;

export type CreateRedisRpcBackendOptions = Partial<RedisRpcServerOptions> & Readonly<{
  redis?: RedisRpcRedisOptions | RedisOptions;
  services?: Record<string, RedisRpcServiceHandler>;
}>;

export type RedisRpcClientOptions = Partial<RedisRpcServerOptions> & Readonly<{
  baseUrl?: string;
  secret?: string;
}>;

export type RedisRpcClient = Readonly<{
  call: <T = unknown>(service: string, method: string, payload?: RpcPayload) => Promise<T>;
  queue: <T = unknown>(method: string, payload?: RpcPayload) => Promise<T>;
  worker: <T = unknown>(method: string, payload?: RpcPayload) => Promise<T>;
  monitor: <T = unknown>(method: string, payload?: RpcPayload) => Promise<T>;
  redis: <T = unknown>(method: string, payload?: RpcPayload) => Promise<T>;
  service: <TService extends object = Record<string, (...args: unknown[]) => Promise<unknown>>>(
    service: string,
    target?: string
  ) => TService;
}>;

export type RedisRpcServerInstance = Readonly<{
  server: http.Server;
  backend: RedisRpcBackend;
  settings: RedisRpcServerOptions;
}>;
