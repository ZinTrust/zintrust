/**
 * Types for @zintrust/system-debugger
 * Sealed type definitions — no side effects.
 */
import type { IDatabase } from '@zintrust/core';

// ---------------------------------------------------------------------------
// Entry types used by the debugger event stream.
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
  payload: Record<string, unknown>;
  responseStatus: number;
  responseHeaders: Record<string, string>;
  duration: number;
  memory: number | null;
  middleware: string[];
  hostname: string;
  userId?: string;
}

export interface QueryContent {
  connection: string;
  sql: string;
  time: number;
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
  method: string;
  url: string;
  requestHeaders: Record<string, string>;
  responseStatus: number;
  duration: number;
  hostname: string;
}

// ---------------------------------------------------------------------------
// Core domain records
// ---------------------------------------------------------------------------

export interface IDebuggerEntry<T = unknown> {
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
}

export interface IDebuggerStorage {
  writeEntry(entry: IDebuggerEntry): Promise<void>;
  updateEntry(
    uuid: string,
    patch: Partial<Pick<IDebuggerEntry, 'content' | 'isLatest'>>
  ): Promise<void>;
  markFamilyStale(familyHash: string, exceptUuid: string): Promise<void>;
  queryEntries(opts: QueryEntriesOptions): Promise<{ data: IDebuggerEntry[]; total: number }>;
  getEntry(uuid: string): Promise<IDebuggerEntry | null>;
  getBatch(batchId: string): Promise<IDebuggerEntry[]>;
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

export interface IDebuggerWatcherConfig {
  storage: IDebuggerStorage;
  config: IDebuggerConfig;
  db?: IDatabase;
  /** Optional: provide to allow HttpWatcher to register as global middleware. */
  registerMiddleware?: (
    fn: (req: unknown, res: unknown, next: () => Promise<void>) => Promise<void>
  ) => void;
}

export interface IDebuggerWatcher {
  register(opts: IDebuggerWatcherConfig): () => void;
}

// ---------------------------------------------------------------------------
// Config interface
// ---------------------------------------------------------------------------

export type RedactionConfig = {
  headers: string[];
  body: string[];
  query: string[];
};

export type WatcherToggles = {
  request?: boolean;
  query?: boolean;
  exception?: boolean;
  log?: boolean;
  job?: boolean;
  cache?: boolean;
  schedule?: boolean;
  mail?: boolean;
  auth?: boolean;
  event?: boolean;
  model?: boolean;
  notification?: boolean;
  redis?: boolean;
  gate?: boolean;
  middleware?: boolean;
  command?: boolean;
  batch?: boolean;
  dump?: boolean;
  view?: boolean;
  clientRequest?: boolean;
};

export interface IDebuggerConfig {
  enabled: boolean;
  connection?: string;
  pruneAfterHours: number;
  ignoreRoutes: string[];
  slowQueryThreshold: number;
  logMinLevel: 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  watchers: WatcherToggles;
  redaction: RedactionConfig;
}

export type DebuggerConfigOverrides = Partial<IDebuggerConfig>;
