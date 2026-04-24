/**
 * @zintrust/trace — public API surface.
 *
 * Zero side-effects. Import watchers, storage, dashboard, and config
 * individually. For full auto-initialisation, use:
 *   import '@zintrust/trace/register';
 */

import { ExceptionWatcher as ExceptionWatcherApi } from './watchers/ExceptionWatcher';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
export { TraceConfig } from './config';

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------
export { TraceStorage } from './storage';
export type { ITraceStorage } from './storage';
export { TraceContentBudget } from './storage/TraceContentBudget';
export { TraceContentRedaction } from './storage/TraceContentRedaction';

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------
export { TraceContext } from './context';

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------
export { registerTraceDashboard, registerTraceRoutes } from './dashboard/routes';
export type { TraceDashboardOptions, TraceDashboardRegistrationOptions } from './dashboard/routes';
export { registerTraceIngestGateway, TraceIngestGateway } from './ingest/TraceIngestGateway';

// ---------------------------------------------------------------------------
// Watchers (named re-exports for use with custom wiring)
// ---------------------------------------------------------------------------
export { AuthWatcher } from './watchers/AuthWatcher';
export { BatchWatcher } from './watchers/BatchWatcher';
export { CacheWatcher } from './watchers/CacheWatcher';
export { CommandWatcher } from './watchers/CommandWatcher';
export { DumpWatcher } from './watchers/DumpWatcher';
export { EventWatcher } from './watchers/EventWatcher';
export { ExceptionWatcher } from './watchers/ExceptionWatcher';
export { GateWatcher } from './watchers/GateWatcher';
export { HttpClientWatcher } from './watchers/HttpClientWatcher';
export { HttpWatcher } from './watchers/HttpWatcher';
export { JobWatcher } from './watchers/JobWatcher';
export { LogWatcher } from './watchers/LogWatcher';
export { MailWatcher } from './watchers/MailWatcher';
export { MiddlewareWatcher } from './watchers/MiddlewareWatcher';
export { ModelWatcher } from './watchers/ModelWatcher';
export { NotificationWatcher } from './watchers/NotificationWatcher';
export { QueryWatcher } from './watchers/QueryWatcher';
export { RedisWatcher } from './watchers/RedisWatcher';
export { ScheduleWatcher } from './watchers/ScheduleWatcher';
export { ViewWatcher } from './watchers/ViewWatcher';

export const captureTraceException = (
  error: unknown,
  context?: { batchId?: string; hostname?: string; path?: string; userId?: string }
): void => {
  ExceptionWatcherApi.capture(error, context);
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export { EntryType } from './types';
export type {
  AuthContent,
  BatchContent,
  CacheContent,
  ClientRequestContent,
  CommandContent,
  DumpContent,
  EntryTypeValue,
  EventContent,
  ExceptionContent,
  GateContent,
  ITraceConfig,
  ITraceEntry,
  ITraceWatcher,
  ITraceWatcherConfig,
  JobContent,
  LogContent,
  MailContent,
  MiddlewareContent,
  ModelContent,
  NotificationContent,
  QueryContent,
  RedactionConfig,
  RedisContent,
  RequestContent,
  ScheduleContent,
  TraceConfigOverrides,
  TraceContentDispatchConfig,
  TraceContentDispatchWorkerConfig,
  ViewContent,
  WatcherToggles,
} from './types';
