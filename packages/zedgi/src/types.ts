export type ZedgiRedisCacheConfig = {
  driver: 'redis-zedgi';
  password?: string;
  database?: number;
  ttl: number;
  header?: Record<string, unknown>;
};

export type ZedgiDatabaseConfig = {
  driver: 'mysql-zedgi' | 'postgres-zedgi' | 'pg-zedgi';
  database?: string;
  username?: string;
  password?: string;
  ssl?: boolean;
  header?: Record<string, unknown>;
};

export type ZedgiQueueConfig = {
  driver: 'queue-zedgi';
  password?: string;
  database?: number;
  header?: Record<string, unknown>;
  profile?: string;
};

export type CacheDriver = {
  get<T>(key: string): Promise<T | null>;
  many?<T>(keys: string[]): Promise<(T | null)[]>;
  set<T>(key: string, value: T, ttl?: number): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
  has(key: string): Promise<boolean>;
  increment?(key: string, amount?: number): Promise<number>;
  decrement?(key: string, amount?: number): Promise<number>;
  dispose?(): Promise<void>;
  getRedisClient?(): unknown;
};

export type QueryResult = {
  rows: Record<string, unknown>[];
  rowCount: number;
  lastInsertId?: string | number | bigint;
};

export type DatabaseAdapter = {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  query(sql: string, parameters: unknown[]): Promise<QueryResult>;
  queryOne(sql: string, parameters: unknown[]): Promise<Record<string, unknown> | null>;
  ping(): Promise<void>;
  transaction<T>(callback: (adapter: DatabaseAdapter) => Promise<T>): Promise<T>;
  rawQuery<T = unknown>(sql: string, parameters?: unknown[]): Promise<T[]>;
  getType(): string;
  isConnected(): boolean;
  getPlaceholder(index: number): string;
};

export type BullMQPayload = Record<string, unknown>;

export type QueueMessage<T = unknown> = { id: string; payload: T; attempts: number };

export type QueueDriver = {
  enqueue(queue: string, payload: BullMQPayload): Promise<string>;
  dequeue<T = unknown>(queue: string): Promise<QueueMessage<T> | undefined>;
  ack(queue: string, id: string): Promise<void>;
  fail?(queue: string, id: string, reason?: string): Promise<void>;
  length(queue: string): Promise<number>;
  drain(queue: string): Promise<void>;
};
