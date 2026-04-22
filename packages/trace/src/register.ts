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
import { TraceContentBudget } from './storage/TraceContentBudget';
import { TraceContentRedaction } from './storage/TraceContentRedaction';
import { TraceEntryFiltering } from './storage/TraceEntryFiltering';
import { TraceWriteDiagnostics } from './storage/TraceWriteDiagnostics';
import {
  assertTraceConnectionResolved,
  assertTraceStorageReady,
  resolveObservedConnectionName,
  resolveTraceConnectionName,
} from './TraceConnection';
import type { ITraceWatcherConfig, TraceConfigOverrides } from './types';

export type {}; // side-effect ESM module

type GlobalTraceRegisterState = {
  __zintrust_system_trace_register_initialized__?: boolean;
  __zintrust_system_trace_plugin_requested__?: boolean;
  __zintrust_system_trace_connection_name__?: string;
  __zintrust_system_trace_observe_connection_name__?: string;
};

const globalTraceRegisterState = globalThis as unknown as GlobalTraceRegisterState;
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
  Logger?: {
    warn(message: string, context?: Record<string, unknown>): void;
  };
  ErrorFactory?: {
    createConfigError(message: string, details?: unknown): Error;
  };
  StartupConfigFile?: {
    Trace?: string;
  };
  StartupConfigFileRegistry?: {
    preload?(files: readonly string[]): Promise<void>;
    get<T>(file: string): T | undefined;
    has?(file: string): boolean;
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

const isObjectValue = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
};

const parseEnvList = (rawValue: string): string[] | undefined => {
  const value = rawValue.trim();
  if (value === '') return undefined;

  if (value.startsWith('[')) {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (Array.isArray(parsed)) {
        return parsed
          .filter((entry): entry is string => typeof entry === 'string')
          .map((entry) => entry.trim())
          .filter((entry) => entry !== '');
      }
    } catch {
      // fall through to CSV parsing
    }
  }

  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '');
};

const parseEnvBool = (rawValue: string): boolean | undefined => {
  const value = rawValue.trim().toLowerCase();
  if (value === '') return undefined;
  if (['1', 'true', 'yes', 'on'].includes(value)) return true;
  if (['0', 'false', 'no', 'off'].includes(value)) return false;
  return undefined;
};

const resolveTraceStartupOverrides = async (
  core: CoreApi
): Promise<TraceConfigOverrides | undefined> => {
  const traceConfigFile = core.StartupConfigFile?.Trace;
  if (typeof traceConfigFile !== 'string' || traceConfigFile.trim() === '') return undefined;

  const registry = core.StartupConfigFileRegistry;
  if (registry?.has?.(traceConfigFile) !== true && typeof registry?.preload === 'function') {
    await registry.preload([traceConfigFile]);
  }

  const overrides = registry?.get<unknown>(traceConfigFile);
  return isObjectValue(overrides) ? (overrides as TraceConfigOverrides) : undefined;
};

const buildTraceRedactionOverrides = (input: {
  startupOverrides?: TraceConfigOverrides;
  redactionBody?: string[];
  redactionHeaders?: string[];
  redactionKeys?: string[];
  redactionQuery?: string[];
}): TraceConfigOverrides['redaction'] | undefined => {
  const redaction: Partial<NonNullable<TraceConfigOverrides['redaction']>> = {
    ...(isObjectValue(input.startupOverrides?.redaction) ? input.startupOverrides?.redaction : {}),
  };

  if (input.redactionKeys === undefined) {
    // no-op
  } else {
    redaction.keys = input.redactionKeys;
  }

  if (input.redactionHeaders === undefined) {
    // no-op
  } else {
    redaction.headers = input.redactionHeaders;
  }

  if (input.redactionBody === undefined) {
    // no-op
  } else {
    redaction.body = input.redactionBody;
  }

  if (input.redactionQuery === undefined) {
    // no-op
  } else {
    redaction.query = input.redactionQuery;
  }

  return Object.keys(redaction).length > 0
    ? (redaction as NonNullable<TraceConfigOverrides['redaction']>)
    : undefined;
};

const core = (await importCore()) as CoreApi;
const Env = core.Env;
const startupOverrides = await resolveTraceStartupOverrides(core);

if (!traceAlreadyInitialized && Env) {
  const enabled = startupOverrides?.enabled === true || Env.getBool('TRACE_ENABLED', false);

  if (enabled) {
    const connectionRaw = Env.get('TRACE_DB_CONNECTION', '').trim();
    const observeConnectionRaw = Env.get('TRACE_QUERY_CONNECTION', '').trim();
    const pruneAfterHoursRaw = Env.get('TRACE_PRUNE_HOURS', '').trim();
    const slowQueryThresholdRaw = Env.get('TRACE_SLOW_QUERY_MS', '').trim();
    const logMinLevelRaw = Env.get('TRACE_LOG_LEVEL', '').trim();
    const captureCachePayloadsRaw = Env.get('TRACE_CACHE_PAYLOADS', '').trim();
    const captureQueryBindingsRaw = Env.get('TRACE_QUERY_BINDINGS', '').trim();
    const contentDispatchDriverRaw = Env.get('TRACE_CONTENT_QUEUE_DRIVER', '').trim();
    const contentDispatchQueueRaw = Env.get('TRACE_CONTENT_QUEUE_NAME', '').trim();
    const contentDispatchEnqueueTimeoutRaw = Env.get(
      'TRACE_CONTENT_QUEUE_ENQUEUE_TIMEOUT_MS',
      ''
    ).trim();
    const contentDispatchWorkerEnabledRaw = Env.get(
      'TRACE_CONTENT_QUEUE_WORKER_ENABLED',
      ''
    ).trim();
    const contentDispatchWorkerIntervalRaw = Env.get(
      'TRACE_CONTENT_QUEUE_WORKER_INTERVAL_MS',
      ''
    ).trim();
    const contentDispatchWorkerDurationRaw = Env.get(
      'TRACE_CONTENT_QUEUE_WORKER_MAX_DURATION_MS',
      ''
    ).trim();
    const contentDispatchWorkerConcurrencyRaw = Env.get(
      'TRACE_CONTENT_QUEUE_WORKER_CONCURRENCY',
      ''
    ).trim();
    const redactionKeys = parseEnvList(Env.get('TRACE_REDACT_KEYS', ''));
    const redactionHeaders = parseEnvList(Env.get('TRACE_REDACT_HEADERS', ''));
    const redactionBody = parseEnvList(Env.get('TRACE_REDACT_BODY', ''));
    const redactionQuery = parseEnvList(Env.get('TRACE_REDACT_QUERY', ''));

    const connection = connectionRaw === '' ? startupOverrides?.connection : connectionRaw;
    const observeConnection =
      observeConnectionRaw === '' ? startupOverrides?.observeConnection : observeConnectionRaw;
    const pruneAfterHours =
      pruneAfterHoursRaw === ''
        ? startupOverrides?.pruneAfterHours
        : Number.parseInt(pruneAfterHoursRaw, 10);
    const slowQueryThreshold =
      slowQueryThresholdRaw === ''
        ? startupOverrides?.slowQueryThreshold
        : Number.parseInt(slowQueryThresholdRaw, 10);
    const logMinLevel = (logMinLevelRaw === '' ? startupOverrides?.logMinLevel : logMinLevelRaw) as
      | 'debug'
      | 'info'
      | 'warn'
      | 'error'
      | 'fatal';
    const captureCachePayloads =
      parseEnvBool(captureCachePayloadsRaw) ?? startupOverrides?.captureCachePayloads;
    const captureQueryBindings =
      parseEnvBool(captureQueryBindingsRaw) ?? startupOverrides?.captureQueryBindings;
    const contentDispatchDriver =
      contentDispatchDriverRaw === ''
        ? startupOverrides?.contentDispatch?.driver
        : contentDispatchDriverRaw;
    const contentDispatchQueueName =
      contentDispatchQueueRaw === ''
        ? startupOverrides?.contentDispatch?.queueName
        : contentDispatchQueueRaw;
    const contentDispatchEnqueueTimeout =
      contentDispatchEnqueueTimeoutRaw === ''
        ? startupOverrides?.contentDispatch?.enqueueTimeoutMs
        : Number.parseInt(contentDispatchEnqueueTimeoutRaw, 10);
    const contentDispatchWorkerEnabled =
      parseEnvBool(contentDispatchWorkerEnabledRaw) ??
      startupOverrides?.contentDispatch?.worker?.enabled;
    const contentDispatchWorkerInterval =
      contentDispatchWorkerIntervalRaw === ''
        ? startupOverrides?.contentDispatch?.worker?.intervalMs
        : Number.parseInt(contentDispatchWorkerIntervalRaw, 10);
    const contentDispatchWorkerDuration =
      contentDispatchWorkerDurationRaw === ''
        ? startupOverrides?.contentDispatch?.worker?.maxDurationMs
        : Number.parseInt(contentDispatchWorkerDurationRaw, 10);
    const contentDispatchWorkerConcurrency =
      contentDispatchWorkerConcurrencyRaw === ''
        ? startupOverrides?.contentDispatch?.worker?.concurrency
        : Number.parseInt(contentDispatchWorkerConcurrencyRaw, 10);
    const redaction = buildTraceRedactionOverrides({
      startupOverrides,
      redactionBody,
      redactionHeaders,
      redactionKeys,
      redactionQuery,
    });
    const defaultContentDispatch = TraceConfig.defaults().contentDispatch;
    const startupContentDispatch = startupOverrides?.contentDispatch;
    const startupContentDispatchWorker = startupContentDispatch?.worker;

    const config = TraceConfig.merge({
      ...startupOverrides,
      enabled,
      connection,
      observeConnection,
      ...(typeof pruneAfterHours === 'number' && Number.isFinite(pruneAfterHours)
        ? { pruneAfterHours }
        : {}),
      ...(typeof slowQueryThreshold === 'number' && Number.isFinite(slowQueryThreshold)
        ? { slowQueryThreshold }
        : {}),
      ...(typeof captureCachePayloads === 'boolean' ? { captureCachePayloads } : {}),
      ...(typeof captureQueryBindings === 'boolean' ? { captureQueryBindings } : {}),
      contentDispatch: {
        ...defaultContentDispatch,
        ...startupContentDispatch,
        ...(typeof contentDispatchDriver === 'string' && contentDispatchDriver !== ''
          ? { driver: contentDispatchDriver }
          : {}),
        ...(typeof contentDispatchQueueName === 'string' && contentDispatchQueueName !== ''
          ? { queueName: contentDispatchQueueName }
          : {}),
        ...(typeof contentDispatchEnqueueTimeout === 'number' &&
        Number.isFinite(contentDispatchEnqueueTimeout)
          ? { enqueueTimeoutMs: contentDispatchEnqueueTimeout }
          : {}),
        worker: {
          ...defaultContentDispatch.worker,
          ...startupContentDispatchWorker,
          enabled:
            typeof contentDispatchWorkerEnabled === 'boolean'
              ? contentDispatchWorkerEnabled
              : (startupContentDispatchWorker?.enabled ?? defaultContentDispatch.worker.enabled),
          intervalMs:
            typeof contentDispatchWorkerInterval === 'number' &&
            Number.isFinite(contentDispatchWorkerInterval)
              ? contentDispatchWorkerInterval
              : (startupContentDispatchWorker?.intervalMs ??
                defaultContentDispatch.worker.intervalMs),
          maxDurationMs:
            typeof contentDispatchWorkerDuration === 'number' &&
            Number.isFinite(contentDispatchWorkerDuration)
              ? contentDispatchWorkerDuration
              : (startupContentDispatchWorker?.maxDurationMs ??
                defaultContentDispatch.worker.maxDurationMs),
          concurrency:
            typeof contentDispatchWorkerConcurrency === 'number' &&
            Number.isFinite(contentDispatchWorkerConcurrency)
              ? contentDispatchWorkerConcurrency
              : (startupContentDispatchWorker?.concurrency ??
                defaultContentDispatch.worker.concurrency),
        },
      },
      logMinLevel,
      ...(redaction === undefined ? {} : { redaction }),
    });

    const resolvedConnectionName = resolveTraceConnectionName(Env, config.connection);
    const resolvedObservedConnectionName = resolveObservedConnectionName(
      Env,
      config.observeConnection,
      resolvedConnectionName
    );
    globalTraceRegisterState.__zintrust_system_trace_connection_name__ = resolvedConnectionName;
    globalTraceRegisterState.__zintrust_system_trace_observe_connection_name__ =
      resolvedObservedConnectionName;
    const storageDb = core.useDatabase?.(undefined, resolvedConnectionName);
    const observedDb = core.useDatabase?.(undefined, resolvedObservedConnectionName);

    assertTraceConnectionResolved(core, storageDb, {
      connectionName: resolvedConnectionName,
      envKey: 'TRACE_DB_CONNECTION',
    });
    assertTraceConnectionResolved(core, observedDb, {
      connectionName: resolvedObservedConnectionName,
      envKey: 'TRACE_QUERY_CONNECTION',
    });
    await assertTraceStorageReady(core, storageDb, resolvedConnectionName);

    const storage = TraceWriteDiagnostics.wrapStorage(
      TraceContentBudget.wrapStorage(
        TraceContentRedaction.wrapStorage(
          TraceEntryFiltering.wrapStorage(TraceStorage.resolveStorage(storageDb), config),
          config.redaction
        ),
        config
      ),
      {
        connectionName: resolvedConnectionName,
        logger: core.Logger,
      }
    );

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

    const watcherArgs = { storage, config, db: observedDb };

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
  }
} else if (!traceAlreadyInitialized) {
  // Running outside a ZinTrust project - skip init silently.
  // eslint-disable-next-line no-console
  console.warn('[trace] @zintrust/core not found - trace will not be activated.');
}
