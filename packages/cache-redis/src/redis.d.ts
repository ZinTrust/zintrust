declare module 'redis' {
  export function createClient(options: unknown): {
    connect: () => Promise<void>;
    isOpen: boolean;
    get: (key: string) => Promise<string | null>;
    set: (key: string, value: string, options?: { EX?: number }) => Promise<unknown>;
    del: (key: string) => Promise<number>;
    flushDb: () => Promise<unknown>;
    exists: (key: string) => Promise<number>;
  };
}
