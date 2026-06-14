export type CloudflareQueueContentType = 'json' | 'text' | 'bytes' | 'v8';

export type CloudflareQueueState =
  | 'waiting'
  | 'queued'
  | 'delayed'
  | 'prioritized'
  | 'active'
  | 'completed'
  | 'failed'
  | 'retrying'
  | 'stalled'
  | 'waiting_children'
  | 'canceled'
  | 'dead_lettered';

export type CloudflareQueueBackoff = {
  type: 'fixed' | 'exponential';
  delay: number;
};

export type CloudflareQueueRetention =
  | boolean
  | number
  | {
      age?: number;
      count?: number;
    };

export type CloudflareRepeatOptions = {
  every?: number;
  cron?: string;
  limit?: number;
  startDate?: Date;
  endDate?: Date;
};

export type CloudflareJobOptions = {
  jobId?: string;
  attempts?: number;
  delay?: number;
  priority?: number;
  lifo?: boolean;
  backoff?: CloudflareQueueBackoff;
  removeOnComplete?: CloudflareQueueRetention;
  removeOnFail?: CloudflareQueueRetention;
  deduplication?: { id: string; ttl?: number; collisionBehavior?: 'suppress' | 'enqueue' };
  uniqueId?: string;
  repeat?: CloudflareRepeatOptions;
};

export type CloudflareQueueEnvelope = {
  protocol: 'zintrust.cf.queue.v1';
  jobId: string;
  queueName: string;
  name: string;
  attempt: number;
  availableAt: string;
  traceId?: string;
};

export type QueueMessage<T = unknown> = { id: string; payload: T; attempts: number };

export type CloudflareQueueSendOptions = {
  contentType?: CloudflareQueueContentType;
  delaySeconds?: number;
};

export type CloudflareQueueBatchMessage = {
  body: unknown;
  options?: CloudflareQueueSendOptions;
};

export type CloudflareQueueBinding = {
  send: (body: unknown, options?: CloudflareQueueSendOptions) => Promise<void>;
  sendBatch?: (messages: CloudflareQueueBatchMessage[]) => Promise<void>;
};

export type D1PreparedStatementLike = {
  bind: (...values: unknown[]) => D1PreparedStatementLike;
  all: <T = Record<string, unknown>>() => Promise<{ results?: T[] }>;
  first: <T = Record<string, unknown>>() => Promise<T | null>;
  run: () => Promise<unknown>;
};

export type D1DatabaseLike = {
  prepare: (query: string) => D1PreparedStatementLike;
  batch?: (statements: D1PreparedStatementLike[]) => Promise<unknown[]>;
  exec?: (query: string) => Promise<unknown>;
};

export type ZinTrustDatabaseLike = {
  query: (sql: string, parameters?: unknown[]) => Promise<unknown[]>;
  queryOne: (sql: string, parameters?: unknown[]) => Promise<unknown>;
  execute: (sql: string, parameters?: unknown[]) => Promise<unknown>;
};

export type CloudflareQueueStateConfig = {
  d1?: D1DatabaseLike;
  db?: ZinTrustDatabaseLike;
  d1BindingName?: string;
  kv?: CloudflareQueueKvBinding;
  kvBindingName?: string;
  coordinator?: CloudflareQueueCoordinatorBinding;
  coordinatorBindingName?: string;
  workerId?: string;
  heartbeatTtlMs?: number;
  rateLimit?: { max: number; durationMs: number; key?: string };
};

export type CloudflareQueueKvBinding = {
  get: (key: string) => Promise<string | null>;
  put: (key: string, value: string, options?: { expirationTtl?: number }) => Promise<void>;
  delete: (key: string) => Promise<void>;
};

export type CloudflareQueueCoordinatorBinding = {
  getByName?: (name: string) => CloudflareQueueCoordinatorStub;
  idFromName?: (name: string) => unknown;
  get?: (id: unknown) => CloudflareQueueCoordinatorStub;
};

export type CloudflareQueueCoordinatorStub = {
  acquireLease?: (input: LeaseInput) => Promise<LeaseResult>;
  heartbeat?: (input: LeaseInput) => Promise<LeaseResult>;
  releaseLease?: (input: LeaseInput) => Promise<void>;
  pause?: () => Promise<void>;
  resume?: () => Promise<void>;
  isPaused?: () => Promise<boolean>;
  rateLimit?: (input: RateLimitInput) => Promise<RateLimitResult>;
};

export type LeaseInput = {
  queueName: string;
  jobId: string;
  workerId: string;
  ttlMs: number;
};

export type LeaseResult = {
  acquired: boolean;
  expiresAt?: number;
  owner?: string;
};

export type RateLimitInput = {
  key: string;
  max: number;
  durationMs: number;
};

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: number;
};

export type CloudflareQueueConfig = {
  driver: 'cloudflare' | 'cloudflare-queues';
  bindingName?: string;
  bindings?: Record<string, CloudflareQueueBinding | undefined>;
  accountId?: string;
  queueId?: string;
  apiToken?: string;
  apiBaseUrl?: string;
  contentType?: CloudflareQueueContentType;
  delaySeconds?: number;
  batchSize?: number;
  visibilityTimeoutMs?: number;
  state?: CloudflareQueueStateConfig;
};

export type CloudflareQueueJobRow = {
  id: string;
  queue_name: string;
  name: string;
  payload: string;
  opts: string | null;
  state: CloudflareQueueState;
  priority: number;
  attempts: number;
  max_attempts: number;
  progress: string | null;
  result: string | null;
  error: string | null;
  dedupe_key: string | null;
  idempotency_key: string | null;
  available_at: string;
  started_at: string | null;
  completed_at: string | null;
  failed_at: string | null;
  stalled_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CloudflareQueueJob<T = unknown> = {
  id: string;
  queueName: string;
  name: string;
  data: T;
  state: CloudflareQueueState;
  attemptsMade: number;
  maxAttempts: number;
  priority: number;
  progress: unknown;
  result: unknown;
  error: unknown;
  opts: CloudflareJobOptions;
  availableAt: string;
  createdAt: string;
  updatedAt: string;
  updateProgress(progress: unknown): Promise<void>;
  log(message: string, data?: unknown): Promise<void>;
  remove(): Promise<void>;
  retry(): Promise<void>;
};

export type CloudflareQueueProcessorContext<T = unknown> = {
  job: CloudflareQueueJob<T>;
  attempt: number;
  updateProgress(progress: unknown): Promise<void>;
  log(message: string, data?: unknown): Promise<void>;
  heartbeat(): Promise<void>;
};

export type CloudflareQueueProcessor<T = unknown, TResult = unknown> = (
  data: T,
  context: CloudflareQueueProcessorContext<T>
) => Promise<TResult> | TResult;

export type CloudflareRepeatableRow = {
  id: string;
  queue_name: string;
  name: string;
  payload: string;
  cron: string | null;
  every_ms: number | null;
  start_at: string | null;
  end_at: string | null;
  limit_count: number | null;
  run_count: number;
  next_run_at: string;
  active: number;
  created_at: string;
  updated_at: string;
};

export type CloudflareFlowInput<TParent = unknown, TChild = unknown> = {
  queueName: string;
  parent: {
    name: string;
    data: TParent;
    options?: CloudflareJobOptions;
  };
  children: Array<{
    name: string;
    data: TChild;
    options?: CloudflareJobOptions;
  }>;
};

export type CloudflareFlowResult<TParent = unknown, TChild = unknown> = {
  parent: CloudflareQueueJob<TParent>;
  children: Array<CloudflareQueueJob<TChild>>;
};

export type CloudflareQueueMetrics = {
  queueName: string;
  counts: Record<string, number>;
  total: number;
};
