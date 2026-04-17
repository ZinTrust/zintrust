/**
 * Types for @zintrust/trace
 * Sealed type definitions — no side effects.
 */
import type { IDatabase } from '@zintrust/core';

// ---------------------------------------------------------------------------
// Entry types used by the trace event stream.
// ---------------------------------------------------------------------------

export const EntryType = Object.freeze({
  REQUEST: 'request',
  QUERY: 'query',
  EXCEPTION: 'exception',
  LOG: 'log',
  JOB: 'job',
  CACHE: 'cache',
  SCHEDULE: 'schedule',
  MAIL: 'mail',
  AUTH: 'auth',
  EVENT: 'event',
  MODEL: 'model',
  NOTIFICATION: 'notification',
  REDIS: 'redis',
  GATE: 'gate',
  MIDDLEWARE: 'middleware',
  COMMAND: 'command',
  BATCH: 'batch',
  DUMP: 'dump',
  VIEW: 'view',
  CLIENT_REQUEST: 'client_request',
} as const);

export type EntryTypeValue = (typeof EntryType)[keyof typeof EntryType];

// ---------------------------------------------------------------------------
// Per-type content shapes
// ---------------------------------------------------------------------------

export interface RequestContent {
  method: string;
  uri: string;
  headers: Record<string, string>;
  payload: unknown;
  responseStatus: number;
  responseHeaders: Record<string, string>;
  responseBody?: unknown;
  duration: number;
  memory: number | null;
  middleware: string[];
  hostname: string;
  userId?: string;
}

export interface QueryContent {
  connection: string;
  sql: string;
  statement?: string;
  bindings?: unknown[];
  bindingsIncluded?: boolean;
  time: number;
  duration: number;
  slow: boolean;
  hash: string;
  hostname: string;
}

export interface ExceptionContent {
  class: string;
  file: string;
  line: number;
  message: string;
  trace: Array<{ file: string; line: number; function?: string }>;
  linePreview: Record<string, string>;
  occurrences: number;
  hostname: string;
  userId?: string;
}

export interface LogContent {
  level: string;
  message: string;
  context?: Record<string, unknown>;
  hostname: string;
}

export interface JobContent {
  status: 'pending' | 'processed' | 'failed';
  connection: string;
  queue: string;
  name: string;
  tries?: number;
  timeout?: number;
  data?: unknown;
  exception?: { message: string; trace: Array<{ file: string; line: number }> };
  hostname: string;
}

export interface CacheContent {
  operation: 'get' | 'set' | 'delete' | 'clear' | 'has';
  key: string;
  hit?: boolean;
  store?: string;
  payload?: unknown;
  payloadLogged?: boolean;
  ttl?: number;
  duration: number;
  hostname: string;
}

export interface ScheduleContent {
  name: string;
  expression: string;
  status: 'ran' | 'failed' | 'skipped';
  duration: number;
  output?: string;
  hostname: string;
}

export interface MailContent {
  to: string;
  subject: string;
  template?: string;
  text?: string;
  html?: string;
  hostname: string;
}

export interface AuthContent {
  event: 'login' | 'logout' | 'failed';
  userId?: string;
  hostname: string;
}

export interface EventContent {
  name: string;
  payload?: unknown;
  listenerCount: number;
  hostname: string;
}

export interface ModelContent {
  action: 'create' | 'update' | 'delete';
  model: string;
  id?: string | number;
  changes?: Record<string, unknown>;
  hostname: string;
}

export interface NotificationContent {
  channels: string[];
  notifiable?: string;
  notification: string;
  message?: string;
  payload?: unknown;
  hostname: string;
}

export interface RedisContent {
  command: string;
  duration: number;
  hostname: string;
}

export interface GateContent {
  ability: string;
  result: 'allowed' | 'denied';
  userId?: string;
  subject?: string;
  hostname: string;
}

export interface MiddlewareContent {
  name: string;
  event: 'before' | 'after';
  duration?: number;
  hostname: string;
}

export interface CommandContent {
  name: string;
  arguments: Record<string, unknown>;
  exitCode: number;
  duration: number;
  output?: string;
  hostname: string;
}

export interface BatchContent {
  name: string;
  total: number;
  processed: number;
  failed: number;
  status: 'pending' | 'processing' | 'finished' | 'failed';
  hostname: string;
}

export interface DumpContent {
  value: unknown;
  file?: string;
  line?: number;
  hostname: string;
}

export interface ViewContent {
  template: string;
  duration: number;
  hostname: string;
}

export interface ClientRequestContent {
  source?: string;
  method: string;
  url: string;
  requestHeaders: Record<string, string>;
  requestBody?: unknown;
  responseStatus?: number;
  responseHeaders?: Record<string, string>;
  responseBody?: unknown;
  error?: string;
  duration: number;
  hostname: string;
}

export interface ClientRequestTraceInput {
  source?: string;
  method: string;
  url: string;
  requestHeaders: Record<string, string>;
  responseStatus?: number;
  duration: number;
  requestBody?: unknown;
  responseHeaders?: Record<string, string>;
  responseBody?: unknown;
  error?: string;
}

// ---------------------------------------------------------------------------
// Core domain records
// ---------------------------------------------------------------------------

export interface ITraceEntry<T = unknown> {
  uuid: string;
  batchId: string;
  familyHash?: string;
  type: EntryTypeValue;
  content: T;
  tags: string[];
  isLatest: boolean;
  createdAt: number;
}

// ---------------------------------------------------------------------------
// Storage interface
// ---------------------------------------------------------------------------

export interface QueryEntriesOptions {
  type?: EntryTypeValue;
  tag?: string;
  batchId?: string;
  from?: number;
  to?: number;
  page?: number;
  perPage?: number;
  summary?: boolean;
}

export interface QueryBatchEntriesOptions {
  type?: EntryTypeValue;
  excludeTypes?: EntryTypeValue[];
  page?: number;
  perPage?: number;
  summary?: boolean;
  countsOnly?: boolean;
}

export interface QueryBatchEntriesResult {
  entries: ITraceEntry[];
  total: number;
  counts: Partial<Record<EntryTypeValue, number>>;
  page: number;
  perPage: number;
}

export interface ITraceStorage {
  writeEntry(entry: ITraceEntry): Promise<void>;
  updateEntry(
    uuid: string,
    patch: Partial<Pick<ITraceEntry, 'content' | 'isLatest'>>
  ): Promise<void>;
  markFamilyStale(familyHash: string, exceptUuid: string): Promise<void>;
  queryEntries(opts: QueryEntriesOptions): Promise<{ data: ITraceEntry[]; total: number }>;
  getEntry(uuid: string): Promise<ITraceEntry | null>;
  getBatch(batchId: string): Promise<ITraceEntry[]>;
  queryBatchEntries(
    batchId: string,
    opts?: QueryBatchEntriesOptions
  ): Promise<QueryBatchEntriesResult>;
  prune(olderThanMs: number, keepExceptions?: boolean): Promise<number>;
  clear(): Promise<void>;
  getMonitoring(): Promise<string[]>;
  addMonitoring(tag: string): Promise<void>;
  removeMonitoring(tag: string): Promise<void>;
  stats(): Promise<Record<EntryTypeValue, number>>;
}

// ---------------------------------------------------------------------------
// Watcher interface
// ---------------------------------------------------------------------------

export interface ITraceWatcherConfig {
  storage: ITraceStorage;
  config: ITraceConfig;
  db?: IDatabase;
  /** Optional: provide to allow HttpWatcher to register as global middleware. */
  registerMiddleware?: (
    fn: (req: unknown, res: unknown, next: () => Promise<void>) => Promise<void>
  ) => void;
}

export interface ITraceWatcher {
  register(opts: ITraceWatcherConfig): () => void;
}

// ---------------------------------------------------------------------------
// Config interface
// ---------------------------------------------------------------------------

export type RedactionConfig = {
  keys: string[];
  headers: string[];
  body: string[];
  query: string[];
};

export type TraceFilterRule = {
  enabled?: boolean;
  include?: string[];
  exclude?: string[];
};

export type TraceClientRequestCaptureRule = TraceFilterRule & {
  requestHeaders?: boolean;
  requestBody?: boolean;
  responseHeaders?: boolean;
  responseBody?: boolean;
};

export type TraceRequestWatcherConfig = TraceFilterRule & {
  all?: TraceFilterRule;
  get?: TraceFilterRule;
  post?: TraceFilterRule;
  put?: TraceFilterRule;
  patch?: TraceFilterRule;
  delete?: TraceFilterRule;
};

export type TraceClientRequestWatcherConfig = TraceClientRequestCaptureRule & {
  sources?: Record<string, TraceClientRequestCaptureRule>;
};

export type TraceContentDispatchWorkerConfig = {
  enabled: boolean;
  intervalMs: number;
  maxDurationMs: number;
  concurrency: number;
};

export type TraceContentDispatchConfig = {
  driver?: string;
  queueName: string;
  enqueueTimeoutMs: number;
  worker: TraceContentDispatchWorkerConfig;
};

export type TraceWatcherToggle = boolean | TraceFilterRule;
export type TraceRequestWatcherToggle = boolean | TraceRequestWatcherConfig;
export type TraceClientRequestWatcherToggle = boolean | TraceClientRequestWatcherConfig;

export type WatcherToggles = {
  request?: TraceRequestWatcherToggle;
  query?: TraceWatcherToggle;
  exception?: TraceWatcherToggle;
  log?: TraceWatcherToggle;
  job?: TraceWatcherToggle;
  cache?: TraceWatcherToggle;
  schedule?: TraceWatcherToggle;
  mail?: TraceWatcherToggle;
  auth?: TraceWatcherToggle;
  event?: TraceWatcherToggle;
  model?: TraceWatcherToggle;
  notification?: TraceWatcherToggle;
  redis?: TraceWatcherToggle;
  gate?: TraceWatcherToggle;
  middleware?: TraceWatcherToggle;
  command?: TraceWatcherToggle;
  batch?: TraceWatcherToggle;
  dump?: TraceWatcherToggle;
  view?: TraceWatcherToggle;
  clientRequest?: TraceClientRequestWatcherToggle;
};

export interface ITraceConfig {
  enabled: boolean;
  connection?: string;
  observeConnection?: string;
  pruneAfterHours: number;
  ignoreRoutes: string[];
  ignorePaths: string[];
  slowQueryThreshold: number;
  captureCachePayloads: boolean;
  captureQueryBindings: boolean;
  logMinLevel: 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  contentDispatch: TraceContentDispatchConfig;
  watchers: WatcherToggles;
  redaction: RedactionConfig;
}

export type TraceConfigOverrides = Partial<ITraceConfig>;
