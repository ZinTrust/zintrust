export type PoolConfig = Readonly<{
  driver: string;
  config: Record<string, unknown>;
}>;
