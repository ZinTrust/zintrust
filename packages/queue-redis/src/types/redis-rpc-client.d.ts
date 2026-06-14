declare module '@zintrust/redis-rpc/client' {
  export type RedisRpcClientOptions = Readonly<{
    baseUrl?: string;
    secret?: string;
    headers?: Record<string, string>;
  }>;

  export type RedisRpcClient = Readonly<{
    queue: <T = unknown>(method: string, payload?: Record<string, unknown>) => Promise<T>;
  }>;

  export function createRedisRpcClient(options?: RedisRpcClientOptions): RedisRpcClient;
}
