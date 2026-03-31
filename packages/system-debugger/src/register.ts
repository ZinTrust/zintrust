/**
 * @zintrust/system-debugger register side-effect module.
 *
 * Import this file once in your bootstrap to activate all debugger watchers:
 *   import '@zintrust/system-debugger/register';
 *
 * Config is read from environment variables (DEBUGGER_* keys) matching
 * the defaults in DebuggerConfig. For custom overrides supply them via
 * calling `initDebugger(overrides)` instead.
 *
 * Routes are NOT auto-mounted here. Wire the dashboard into your router:
 *   import { registerDebuggerRoutes } from '@zintrust/system-debugger';
 *   registerDebuggerRoutes(router, DebuggerStorage.resolveStorage(db), {
 *     middleware: ['admin'],
 *   });
 */
import { DebuggerConfig } from './config';
import { DebuggerContext } from './context';
import { DebuggerStorage } from './storage/DebuggerStorage';

export type {}; // side-effect ESM module

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
  getKernel?: () => Promise<{ registerGlobalMiddleware(fn: unknown): void }>;
};

const resolveKernel = async (
  getKernel: CoreApi['getKernel']
): Promise<{ registerGlobalMiddleware(fn: unknown): void } | null> => {
  if (!getKernel) return null;

  try {
    return await getKernel();
  } catch {
    return null;
  }
};

const core = (await importCore()) as CoreApi;
const Env = core.Env;

if (Env) {
  const enabled = Env.getBool('DEBUGGER_ENABLED', false);

  if (enabled) {
    const connection = Env.get('DEBUGGER_DB_CONNECTION', '') || undefined;
    const pruneAfterHours = Env.getInt('DEBUGGER_PRUNE_HOURS', 24);
    const slowQueryThreshold = Env.getInt('DEBUGGER_SLOW_QUERY_MS', 100);
    const logMinLevel = Env.get('DEBUGGER_LOG_LEVEL', 'info') as
      | 'debug'
      | 'info'
      | 'warn'
      | 'error'
      | 'fatal';

    const config = DebuggerConfig.merge({
      enabled,
      connection,
      pruneAfterHours,
      slowQueryThreshold,
      logMinLevel,
    });

    const db = core.useDatabase?.(undefined, connection ?? 'default');

    if (db) {
      const storage = DebuggerStorage.resolveStorage(db);

      if (core.RequestContext) {
        DebuggerContext.setRequestContextImpl(core.RequestContext as { current(): unknown });
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

      // Wire HttpWatcher via kernel if available (may be async — does not block)
      const kernel = await resolveKernel(core.getKernel);

      const registerMiddleware = kernel
        ? (fn: unknown): void => kernel.registerGlobalMiddleware(fn)
        : undefined;
      HttpWatcher.register({ ...watcherArgs, registerMiddleware });

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
      console.warn('[system-debugger] Could not resolve database connection — skipping init.');
    }
  }
} else {
  // Running outside a ZinTrust project — skip init silently.
  // eslint-disable-next-line no-console
  console.warn('[system-debugger] @zintrust/core not found — debugger will not be activated.');
}
