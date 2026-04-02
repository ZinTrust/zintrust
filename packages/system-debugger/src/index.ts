/**
 * @zintrust/system-debugger — public API surface.
 *
 * Zero side-effects. Import watchers, storage, dashboard, and config
 * individually. For full auto-initialisation, use:
 *   import '@zintrust/system-debugger/register';
 */

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
export { DebuggerConfig } from './config';

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------
export { DebuggerStorage } from './storage';
export type { IDebuggerStorage } from './storage';

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------
export { DebuggerContext } from './context';

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------
export { registerDebuggerDashboard } from './dashboard/routes';
export { registerDebuggerRoutes } from './dashboard/routes';
export type {
  DebuggerDashboardOptions,
  DebuggerDashboardRegistrationOptions,
} from './dashboard/routes';

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
  DebuggerConfigOverrides,
  DumpContent,
  EntryTypeValue,
  EventContent,
  ExceptionContent,
  GateContent,
  IDebuggerConfig,
  IDebuggerEntry,
  IDebuggerWatcher,
  IDebuggerWatcherConfig,
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
  ViewContent,
  WatcherToggles,
} from './types';
