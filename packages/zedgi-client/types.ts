export type ZedgiClientOptions = Readonly<{
  url: string;
  key: string;
  timeout?: number;
}>;

export type ZedgiServiceType = 'redis' | 'postgres' | 'mysql';

export type ZedgiCallOptions = Readonly<{
  requestId?: string;
}>;

export type QueryResult<T = Record<string, unknown>> = Readonly<{
  rows: T[];
  rowCount: number | null;
  fields?: Array<{ name: string }>;
}>;

export type MysqlQueryResult<T = Record<string, unknown>> = Readonly<{
  rows: T[];
  fields: string[];
}>;

export type TransactionStatement = Readonly<{
  sql: string;
  params?: unknown[];
}>;

export type RedisClient = Readonly<{
  ping: () => Promise<string>;
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string, ...args: unknown[]) => Promise<'OK' | null>;
  del: (...keys: string[]) => Promise<number>;
  exists: (...keys: string[]) => Promise<number>;
  expire: (key: string, seconds: number) => Promise<number>;
  ttl: (key: string) => Promise<number>;
  incr: (key: string) => Promise<number>;
  decr: (key: string) => Promise<number>;
  incrby: (key: string, increment: number) => Promise<number>;
  decrby: (key: string, decrement: number) => Promise<number>;
  hget: (key: string, field: string) => Promise<string | null>;
  hset: (key: string, ...fieldValues: string[]) => Promise<number>;
  hgetall: (key: string) => Promise<Record<string, string> | null>;
  hdel: (key: string, ...fields: string[]) => Promise<number>;
  lpush: (key: string, ...values: string[]) => Promise<number>;
  rpush: (key: string, ...values: string[]) => Promise<number>;
  lpop: (key: string) => Promise<string | null>;
  rpop: (key: string) => Promise<string | null>;
  lrange: (key: string, start: number, stop: number) => Promise<string[]>;
  sadd: (key: string, ...members: string[]) => Promise<number>;
  srem: (key: string, ...members: string[]) => Promise<number>;
  smembers: (key: string) => Promise<string[]>;
  sismember: (key: string, member: string) => Promise<number>;
  zadd: (key: string, score: number, member: string) => Promise<number>;
  zrange: (key: string, start: number, stop: number) => Promise<string[]>;
  zscore: (key: string, member: string) => Promise<string | null>;
  call: (command: string, ...args: unknown[]) => Promise<unknown>;
  pipeline: (commands: Array<{ command: string; args?: unknown[] }>) => Promise<unknown[]>;
  multi: (commands: Array<{ command: string; args?: unknown[] }>) => Promise<unknown[]>;
}>;

export type PostgresClient = Readonly<{
  ping: () => Promise<{ pong: boolean }>;
  query: <T = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<QueryResult<T>>;
  transaction: (statements: TransactionStatement[]) => Promise<QueryResult[]>;
}>;

export type MySQLClient = Readonly<{
  ping: () => Promise<{ pong: boolean }>;
  query: <T = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<MysqlQueryResult<T>>;
  transaction: (statements: TransactionStatement[]) => Promise<MysqlQueryResult[]>;
}>;

export type ZedgiClient = Readonly<{
  redis: () => RedisClient;
  postgres: () => PostgresClient;
  mysql: () => MySQLClient;
  call: <T = unknown>(service: ZedgiServiceType, method: string, payload?: Record<string, unknown>) => Promise<T>;
}>;
