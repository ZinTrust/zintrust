export type PoolDriverHealth = Readonly<{ connected: boolean; meta?: Record<string, unknown> }>;

export type PoolDriver = Readonly<{
  name: string;
  initialize: (config: Record<string, unknown>) => Promise<void>;
  execute: (command: string, params: unknown[], method?: string) => Promise<unknown>;
  teardown: () => Promise<void>;
  health: () => Promise<PoolDriverHealth>;
}>;
