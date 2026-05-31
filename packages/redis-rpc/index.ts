export { createRedisRpcServer, listenRedisRpcServer } from './server';
export { createRedisRpcClient } from './client';
export { rpcClientHeaders, rpcServerOptions, redisConnectionOptions } from './env';
export {
  createBullMqRpcQueue,
  createWorkerRpcRuntime,
  createQueueMonitorRpcDriver,
  createRedisRpcService,
} from './adapters';
export { createRedisRpcBackend } from './backend';

export type {
  RpcPayload,
  RpcRequest,
  RpcErrorBody,
  RpcSuccessBody,
  RedisRpcBackendState,
  RedisRpcServiceHandler,
  RedisRpcBackend,
  CreateRedisRpcBackendOptions,
  RedisRpcClientOptions,
  RedisRpcClient,
  RedisRpcServerInstance,
} from './types';

/**
 * Package version and build metadata
 * Available at runtime for debugging and health checks
 */
export const _ZINTRUST_REDIS_RPC_VERSION = '1.0.0';
export const _ZINTRUST_REDIS_RPC_BUILD_DATE = '__BUILD_DATE__';
