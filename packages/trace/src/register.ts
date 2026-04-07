/**
 * @zintrust/trace register side-effect module.
 *
 * For plugin-file activation, prefer:
 *   import '@zintrust/trace/plugin';
 *
 * The framework boot layer will lazy-load this register module once the app
 * runtime is ready. Importing this file directly is still supported for
 * advanced manual bootstrap flows that intentionally activate the trace
 * after databases and the kernel are available.
 *
 * Config is read from environment variables (TRACE_* keys) matching
 * the defaults in TraceConfig. For custom overrides supply them via
 * calling `initTrace(overrides)` instead.
 *
 * Routes are NOT auto-mounted here. Wire the dashboard into your router:
 *   import { registerTraceDashboard } from '@zintrust/trace/ui';
 *   registerTraceDashboard(router, {
 *     middleware: ['admin'],
 *   });
 */
import { TraceConfig } from './config';
import { TraceContext } from './context';
import { TraceStorage } from './storage';
import type { ITraceWatcherConfig } from './types';

export type {}; // side-effect ESM module

type GlobalTraceRegisterState = {
  __zintrust_system_trace_register_initialized__?: boolean;
  __zintrust_system_trace_plugin_requested__?: boolean;
};

const globalTraceRegisterState = globalThis as unknown as GlobalTraceRegisterState;
globalTraceRegisterState.__zintrust_system_trace_plugin_requested__ = true;
const traceAlreadyInitialized =
  globalTraceRegisterState.__zintrust_system_trace_register_initialized__ === true;

if (!traceAlreadyInitialized) {
  globalTraceRegisterState.__zintrust_system_trace_register_initialized__ = true;
}

const importCore = async (): Promise<unknown> => {
  try {
    return await import('@zintrust/core');
  } catch {
    return {};
  }
};

type CoreApi = {
  Env?: {
    getBool(key: string, fallback: boolean): boolean;
    get(key: string, fallback: string): string;
    getInt(key: string, fallback: number): number;
  };
  useDatabase?: (config?: unknown, connection?: string) => import('@zintrust/core').IDatabase;
  RequestContext?: {
    current(): unknown;
  };
};

type GlobalMiddlewareRegistrarState = {
  __zintrust_register_global_middleware__?: ITraceWatcherConfig['registerMiddleware'];
  __zintrust_pending_global_middlewares__?: Array<
    Parameters<NonNullable<ITraceWatcherConfig['registerMiddleware']>>[0]
  >;
};

const resolveRegisterMiddleware = (): NonNullable<ITraceWatcherConfig['registerMiddleware']> => {
  const globalMiddlewareRegistrarState = globalThis as unknown as GlobalMiddlewareRegistrarState;

  return (middleware): void => {
    const registerMiddleware =
      globalMiddlewareRegistrarState.__zintrust_register_global_middleware__;
    if (typeof registerMiddleware === 'function') {
      registerMiddleware(middleware);
      return;
    }

    globalMiddlewareRegistrarState.__zintrust_pending_global_middlewares__ ??= [];
    globalMiddlewareRegistrarState.__zintrust_pending_global_middlewares__.push(middleware);
  };
};

const resolveTraceConnectionName = (
  env: Pick<NonNullable<CoreApi['Env']>, 'get'> | undefined,
  configuredConnection?: string
): string => {
  const resolveDefaultConnection = (): string => {
    const defaultConnection = env?.get('DB_CONNECTION', '').trim() ?? '';
    if (defaultConnection === '' || defaultConnection === 'default') return 'default';
    return defaultConnection;
  };

  const explicitConnection = configuredConnection?.trim();
  if (explicitConnection !== undefined && explicitConnection !== '') {
    return explicitConnection === 'default' ? resolveDefaultConnection() : explicitConnection;
  }

  return resolveDefaultConnection();
};

const core = (await importCore()) as CoreApi;
const Env = core.Env;

if (!traceAlreadyInitialized && Env) {
  const enabled = Env.getBool('TRACE_ENABLED', false);

  if (enabled) {
    const connection = Env.get('TRACE_DB_CONNECTION', '') || undefined;
    const pruneAfterHours = Env.getInt('TRACE_PRUNE_HOURS', 24);
    const slowQueryThreshold = Env.getInt('TRACE_SLOW_QUERY_MS', 100);
    const logMinLevel = Env.get('TRACE_LOG_LEVEL', 'info') as
      | 'debug'
      | 'info'
      | 'warn'
      | 'error'
      | 'fatal';

    const config = TraceConfig.merge({
      enabled,
      connection,
      pruneAfterHours,
      slowQueryThreshold,
      logMinLevel,
    });

    const db = core.useDatabase?.(undefined, resolveTraceConnectionName(Env, connection));

    if (db) {
      const storage = TraceStorage.resolveStorage(db);

      if (core.RequestContext) {
        TraceContext.setRequestContextImpl(
          core.RequestContext as {
            current?: () => unknown;
            peek?: () => unknown;
          }
        );
      }

      const [
        { HttpWatcher },
        { QueryWatcher },
        { LogWatcher },
        { ExceptionWatcher },
        { JobWatcher },
        { CacheWatcher },
        { ScheduleWatcher },
        { MailWatcher },
        { AuthWatcher },
        { EventWatcher },
        { ModelWatcher },
        { NotificationWatcher },
        { RedisWatcher },
        { GateWatcher },
        { MiddlewareWatcher },
        { CommandWatcher },
        { BatchWatcher },
        { DumpWatcher },
        { ViewWatcher },
        { HttpClientWatcher },
      ] = await Promise.all([
        import('./watchers/HttpWatcher'),
        import('./watchers/QueryWatcher'),
        import('./watchers/LogWatcher'),
        import('./watchers/ExceptionWatcher'),
        import('./watchers/JobWatcher'),
        import('./watchers/CacheWatcher'),
        import('./watchers/ScheduleWatcher'),
        import('./watchers/MailWatcher'),
        import('./watchers/AuthWatcher'),
        import('./watchers/EventWatcher'),
        import('./watchers/ModelWatcher'),
        import('./watchers/NotificationWatcher'),
        import('./watchers/RedisWatcher'),
        import('./watchers/GateWatcher'),
        import('./watchers/MiddlewareWatcher'),
        import('./watchers/CommandWatcher'),
        import('./watchers/BatchWatcher'),
        import('./watchers/DumpWatcher'),
        import('./watchers/ViewWatcher'),
        import('./watchers/HttpClientWatcher'),
      ]);

      const watcherArgs = { storage, config, db };

      HttpWatcher.register({ ...watcherArgs, registerMiddleware: resolveRegisterMiddleware() });

      QueryWatcher.register(watcherArgs);
      LogWatcher.register(watcherArgs);
      ExceptionWatcher.register(watcherArgs);
      JobWatcher.register(watcherArgs);
      CacheWatcher.register(watcherArgs);
      ScheduleWatcher.register(watcherArgs);
      MailWatcher.register(watcherArgs);
      AuthWatcher.register(watcherArgs);
      EventWatcher.register(watcherArgs);
      ModelWatcher.register(watcherArgs);
      NotificationWatcher.register(watcherArgs);
      RedisWatcher.register(watcherArgs);
      GateWatcher.register(watcherArgs);
      MiddlewareWatcher.register(watcherArgs);
      CommandWatcher.register(watcherArgs);
      BatchWatcher.register(watcherArgs);
      DumpWatcher.register(watcherArgs);
      ViewWatcher.register(watcherArgs);
      HttpClientWatcher.register(watcherArgs);
    } else {
      // eslint-disable-next-line no-console
      console.warn('[trace] Could not resolve database connection - skipping init.');
    }
  }
} else if (!traceAlreadyInitialized) {
  // Running outside a ZinTrust project - skip init silently.
  // eslint-disable-next-line no-console
  console.warn('[trace] @zintrust/core not found - trace will not be activated.');
}
