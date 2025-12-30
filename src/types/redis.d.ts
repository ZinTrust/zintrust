declare module 'redis' {
  export type RedisClientType = {
    connect?: () => Promise<void>;
    rPush: (queue: string, value: string) => Promise<number>;
    lPop: (queue: string) => Promise<string | null>;
    lLen: (queue: string) => Promise<number>;
    del: (queue: string) => Promise<number>;
  };

  export const createClient: (opts: { url: string }) => RedisClientType;
}
