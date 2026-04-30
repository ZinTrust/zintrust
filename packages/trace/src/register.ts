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
import { ProxyTraceStorage, TraceServiceTag, TraceStorage } from './storage';
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

type TraceEnvApi = NonNullable<CoreApi['Env']>;

type TraceEnvValues = {
  connectionRaw: string;
  observeConnectionRaw: string;
  pruneAfterHoursRaw: string;
  slowQueryThresholdRaw: string;
  logMinLevelRaw: string;
  traceProxyRaw: string;
  traceProxyUrlRaw: string;
  traceProxyPathRaw: string;
  traceProxyKeyIdRaw: string;
  traceProxySecretRaw: string;
  traceProxyTimeoutRaw: string;
  traceServiceTagRaw: string;
  appNameRaw: string;
  appKeyRaw: string;
  captureCachePayloadsRaw: string;
  captureQueryBindingsRaw: string;
  contentDispatchDriverRaw: string;
  contentDispatchQueueRaw: string;
  contentDispatchEnqueueTimeoutRaw: string;
  contentDispatchWorkerEnabledRaw: string;
  contentDispatchWorkerIntervalRaw: string;
  contentDispatchWorkerDurationRaw: string;
  contentDispatchWorkerConcurrencyRaw: string;
  redactionKeys?: string[];
  redactionHeaders?: string[];
  redactionBody?: string[];
  redactionQuery?: string[];
};

const readTraceEnvValues = (Env: TraceEnvApi): TraceEnvValues => {
  return {
    connectionRaw: Env.get('TRACE_DB_CONNECTION', '').trim(),
    observeConnectionRaw: Env.get('TRACE_QUERY_CONNECTION', '').trim(),
    pruneAfterHoursRaw: Env.get('TRACE_PRUNE_HOURS', '').trim(),
    slowQueryThresholdRaw: Env.get('TRACE_SLOW_QUERY_MS', '').trim(),
    logMinLevelRaw: Env.get('TRACE_LOG_LEVEL', '').trim(),
    traceProxyRaw: Env.get('TRACE_PROXY', '').trim(),
    traceProxyUrlRaw: Env.get('TRACE_PROXY_URL', '').trim(),
    traceProxyPathRaw: Env.get('TRACE_PROXY_PATH', '').trim(),
    traceProxyKeyIdRaw: Env.get('TRACE_PROXY_KEY_ID', '').trim(),
    traceProxySecretRaw: Env.get('TRACE_PROXY_SECRET', '').trim(),
    traceProxyTimeoutRaw: Env.get('TRACE_PROXY_TIMEOUT_MS', '').trim(),
    traceServiceTagRaw: Env.get('TRACE_SERVICE_TAG', '').trim(),
    appNameRaw: Env.get('APP_NAME', '').trim(),
    appKeyRaw: Env.get('APP_KEY', '').trim(),
    captureCachePayloadsRaw: Env.get('TRACE_CACHE_PAYLOADS', '').trim(),
    captureQueryBindingsRaw: Env.get('TRACE_QUERY_BINDINGS', '').trim(),
    contentDispatchDriverRaw: Env.get('TRACE_CONTENT_QUEUE_DRIVER', '').trim(),
    contentDispatchQueueRaw: Env.get('TRACE_CONTENT_QUEUE_NAME', '').trim(),
    contentDispatchEnqueueTimeoutRaw: Env.get('TRACE_CONTENT_QUEUE_ENQUEUE_TIMEOUT_MS', '').trim(),
    contentDispatchWorkerEnabledRaw: Env.get('TRACE_CONTENT_QUEUE_WORKER_ENABLED', '').trim(),
    contentDispatchWorkerIntervalRaw: Env.get('TRACE_CONTENT_QUEUE_WORKER_INTERVAL_MS', '').trim(),
    contentDispatchWorkerDurationRaw: Env.get(
      'TRACE_CONTENT_QUEUE_WORKER_MAX_DURATION_MS',
      ''
    ).trim(),
    contentDispatchWorkerConcurrencyRaw: Env.get(
      'TRACE_CONTENT_QUEUE_WORKER_CONCURRENCY',
      ''
    ).trim(),
    redactionKeys: parseEnvList(Env.get('TRACE_REDACT_KEYS', '')),
    redactionHeaders: parseEnvList(Env.get('TRACE_REDACT_HEADERS', '')),
    redactionBody: parseEnvList(Env.get('TRACE_REDACT_BODY', '')),
    redactionQuery: parseEnvList(Env.get('TRACE_REDACT_QUERY', '')),
  };
};

const resolveStringOverride = (
  rawValue: string,
  fallback: string | undefined
): string | undefined => {
  return rawValue === '' ? fallback : rawValue;
};

const resolveNumberOverride = (
  rawValue: string,
  fallback: number | undefined
): number | undefined => {
  return rawValue === '' ? fallback : Number.parseInt(rawValue, 10);
};

const resolveBooleanOverride = (
  rawValue: string,
  fallback: boolean | undefined
): boolean | undefined => {
  return parseEnvBool(rawValue) ?? fallback;
};

const resolveTraceProxyKeyId = (
  startupOverrides: TraceConfigOverrides | undefined,
  values: TraceEnvValues
): string | undefined => {
  return resolveStringOverride(
    values.traceProxyKeyIdRaw,
    startupOverrides?.proxy?.keyId ?? values.appNameRaw
  );
};

const resolveTraceProxySecret = (
  startupOverrides: TraceConfigOverrides | undefined,
  values: TraceEnvValues
): string | undefined => {
  return resolveStringOverride(
    values.traceProxySecretRaw,
    startupOverrides?.proxy?.secret ?? values.appKeyRaw
  );
};

const withStringProperty = (key: string, value: string | undefined): Record<string, string> => {
  return typeof value === 'string' && value !== '' ? { [key]: value } : {};
};

const withNumberProperty = (key: string, value: number | undefined): Record<string, number> => {
  return typeof value === 'number' && Number.isFinite(value) ? { [key]: value } : {};
};

const withBooleanProperty = (key: string, value: boolean | undefined): Record<string, boolean> => {
  return typeof value === 'boolean' ? { [key]: value } : {};
};

const resolveTraceServiceTag = (
  startupOverrides: TraceConfigOverrides | undefined,
  values: TraceEnvValues
): string | undefined => {
  const fallback = (startupOverrides?.serviceTag ?? values.appNameRaw).trim() || undefined;
  return resolveStringOverride(values.traceServiceTagRaw, fallback);
};

const resolveContentDispatchWorkerEnabled = (
  startupOverrides: TraceConfigOverrides | undefined,
  values: TraceEnvValues
): boolean | undefined => {
  return resolveBooleanOverride(
    values.contentDispatchWorkerEnabledRaw,
    startupOverrides?.contentDispatch?.worker?.enabled
  );
};

const resolveContentDispatchWorkerInterval = (
  startupOverrides: TraceConfigOverrides | undefined,
  values: TraceEnvValues
): number | undefined => {
  return resolveNumberOverride(
    values.contentDispatchWorkerIntervalRaw,
    startupOverrides?.contentDispatch?.worker?.intervalMs
  );
};

const resolveContentDispatchWorkerDuration = (
  startupOverrides: TraceConfigOverrides | undefined,
  values: TraceEnvValues
): number | undefined => {
  return resolveNumberOverride(
    values.contentDispatchWorkerDurationRaw,
    startupOverrides?.contentDispatch?.worker?.maxDurationMs
  );
};

const resolveContentDispatchWorkerConcurrency = (
  startupOverrides: TraceConfigOverrides | undefined,
  values: TraceEnvValues
): number | undefined => {
  return resolveNumberOverride(
    values.contentDispatchWorkerConcurrencyRaw,
    startupOverrides?.contentDispatch?.worker?.concurrency
  );
};

const buildTraceContentDispatchWorkerConfig = (
  startupOverrides: TraceConfigOverrides | undefined,
  values: TraceEnvValues
): NonNullable<NonNullable<TraceConfigOverrides['contentDispatch']>['worker']> => {
  const defaultWorker = TraceConfig.defaults().contentDispatch.worker;
  const startupWorker = startupOverrides?.contentDispatch?.worker;
  const contentDispatchWorkerEnabled = resolveContentDispatchWorkerEnabled(
    startupOverrides,
    values
  );
  const contentDispatchWorkerInterval = resolveContentDispatchWorkerInterval(
    startupOverrides,
    values
  );
  const contentDispatchWorkerDuration = resolveContentDispatchWorkerDuration(
    startupOverrides,
    values
  );
  const contentDispatchWorkerConcurrency = resolveContentDispatchWorkerConcurrency(
    startupOverrides,
    values
  );

  return {
    ...defaultWorker,
    ...startupWorker,
    enabled: contentDispatchWorkerEnabled ?? startupWorker?.enabled ?? defaultWorker.enabled,
    intervalMs:
      contentDispatchWorkerInterval ?? startupWorker?.intervalMs ?? defaultWorker.intervalMs,
    maxDurationMs:
      contentDispatchWorkerDuration ?? startupWorker?.maxDurationMs ?? defaultWorker.maxDurationMs,
    concurrency:
      contentDispatchWorkerConcurrency ?? startupWorker?.concurrency ?? defaultWorker.concurrency,
  };
};

const buildTraceProxyConfig = (
  startupOverrides: TraceConfigOverrides | undefined,
  values: TraceEnvValues
): TraceConfigOverrides['proxy'] => {
  const traceProxyEnabled = resolveBooleanOverride(
    values.traceProxyRaw,
    startupOverrides?.proxy?.enabled
  );
  const traceProxyUrl = resolveStringOverride(
    values.traceProxyUrlRaw,
    startupOverrides?.proxy?.url
  );
  const traceProxyPath = resolveStringOverride(
    values.traceProxyPathRaw,
    startupOverrides?.proxy?.path
  );
  const traceProxyKeyId = resolveTraceProxyKeyId(startupOverrides, values);
  const traceProxySecret = resolveTraceProxySecret(startupOverrides, values);
  const traceProxyTimeout = resolveNumberOverride(
    values.traceProxyTimeoutRaw,
    startupOverrides?.proxy?.timeoutMs
  );

  return {
    ...TraceConfig.defaults().proxy,
    ...startupOverrides?.proxy,
    ...withBooleanProperty('enabled', traceProxyEnabled),
    ...withStringProperty('url', traceProxyUrl),
    ...withStringProperty('path', traceProxyPath),
    ...withStringProperty('keyId', traceProxyKeyId),
    ...withStringProperty('secret', traceProxySecret),
    ...withNumberProperty('timeoutMs', traceProxyTimeout),
  };
};

const buildTraceContentDispatchConfig = (
  startupOverrides: TraceConfigOverrides | undefined,
  values: TraceEnvValues
): NonNullable<TraceConfigOverrides['contentDispatch']> => {
  const defaultContentDispatch = TraceConfig.defaults().contentDispatch;
  const startupContentDispatch = startupOverrides?.contentDispatch;
  const contentDispatchDriver = resolveStringOverride(
    values.contentDispatchDriverRaw,
    startupContentDispatch?.driver
  );
  const contentDispatchQueueName = resolveStringOverride(
    values.contentDispatchQueueRaw,
    startupContentDispatch?.queueName
  );
  const contentDispatchEnqueueTimeout = resolveNumberOverride(
    values.contentDispatchEnqueueTimeoutRaw,
    startupContentDispatch?.enqueueTimeoutMs
  );

  return {
    ...defaultContentDispatch,
    ...startupContentDispatch,
    ...withStringProperty('driver', contentDispatchDriver),
    ...withStringProperty('queueName', contentDispatchQueueName),
    ...withNumberProperty('enqueueTimeoutMs', contentDispatchEnqueueTimeout),
    worker: buildTraceContentDispatchWorkerConfig(startupOverrides, values),
  };
};

const buildTraceRuntimeConfig = (
  Env: TraceEnvApi,
  startupOverrides: TraceConfigOverrides | undefined
): ReturnType<typeof TraceConfig.merge> => {
  const values = readTraceEnvValues(Env);
  const enabled = startupOverrides?.enabled === true || Env.getBool('TRACE_ENABLED', false);
  const connection = resolveStringOverride(values.connectionRaw, startupOverrides?.connection);
  const observeConnection = resolveStringOverride(
    values.observeConnectionRaw,
    startupOverrides?.observeConnection
  );
  const pruneAfterHours = resolveNumberOverride(
    values.pruneAfterHoursRaw,
    startupOverrides?.pruneAfterHours
  );
  const slowQueryThreshold = resolveNumberOverride(
    values.slowQueryThresholdRaw,
    startupOverrides?.slowQueryThreshold
  );
  const logMinLevel = (
    values.logMinLevelRaw === '' ? startupOverrides?.logMinLevel : values.logMinLevelRaw
  ) as 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  const captureCachePayloads = resolveBooleanOverride(
    values.captureCachePayloadsRaw,
    startupOverrides?.captureCachePayloads
  );
  const captureQueryBindings = resolveBooleanOverride(
    values.captureQueryBindingsRaw,
    startupOverrides?.captureQueryBindings
  );
  const traceServiceTag = resolveTraceServiceTag(startupOverrides, values);
  const redaction = buildTraceRedactionOverrides({
    startupOverrides,
    redactionBody: values.redactionBody,
    redactionHeaders: values.redactionHeaders,
    redactionKeys: values.redactionKeys,
    redactionQuery: values.redactionQuery,
  });

  return TraceConfig.merge({
    ...startupOverrides,
    enabled,
    connection,
    observeConnection,
    ...withStringProperty('serviceTag', traceServiceTag),
    proxy: buildTraceProxyConfig(startupOverrides, values),
    ...withNumberProperty('pruneAfterHours', pruneAfterHours),
    ...withNumberProperty('slowQueryThreshold', slowQueryThreshold),
    ...withBooleanProperty('captureCachePayloads', captureCachePayloads),
    ...withBooleanProperty('captureQueryBindings', captureQueryBindings),
    contentDispatch: buildTraceContentDispatchConfig(startupOverrides, values),
    logMinLevel,
    ...(redaction === undefined ? {} : { redaction }),
  });
};

const createTraceWatcherArgs = async (
  core: CoreApi,
  Env: TraceEnvApi,
  config: ReturnType<typeof TraceConfig.merge>
): Promise<Pick<ITraceWatcherConfig, 'storage' | 'config' | 'db'>> => {
  const resolvedConnectionName = resolveTraceConnectionName(Env, config.connection);
  const resolvedObservedConnectionName = resolveObservedConnectionName(
    Env,
    config.observeConnection,
    resolvedConnectionName
  );
  globalTraceRegisterState.__zintrust_system_trace_connection_name__ = resolvedConnectionName;
  globalTraceRegisterState.__zintrust_system_trace_observe_connection_name__ =
    resolvedObservedConnectionName;

  const observedDb = core.useDatabase?.(undefined, resolvedObservedConnectionName);
  assertTraceConnectionResolved(core, observedDb, {
    connectionName: resolvedObservedConnectionName,
    envKey: 'TRACE_QUERY_CONNECTION',
  });

  let resolvedStorage;

  if (config.proxy.enabled) {
    resolvedStorage = ProxyTraceStorage.create({
      baseUrl: config.proxy.url ?? '',
      path: config.proxy.path,
      keyId: config.proxy.keyId ?? '',
      secret: config.proxy.secret ?? '',
      timeoutMs: config.proxy.timeoutMs,
    });
  } else {
    const storageDb = core.useDatabase?.(undefined, resolvedConnectionName);

    assertTraceConnectionResolved(core, storageDb, {
      connectionName: resolvedConnectionName,
      envKey: 'TRACE_DB_CONNECTION',
    });
    await assertTraceStorageReady(core, storageDb, resolvedConnectionName);

    resolvedStorage = TraceStorage.resolveStorage(storageDb);
  }

  const storage = TraceWriteDiagnostics.wrapStorage(
    TraceContentBudget.wrapStorage(
      TraceContentRedaction.wrapStorage(
        TraceEntryFiltering.wrapStorage(
          TraceServiceTag.wrapStorage(resolvedStorage, config),
          config
        ),
        config.redaction
      ),
      config
    ),
    {
      connectionName: resolvedConnectionName,
      logger: core.Logger,
    }
  );

  return { storage, config, db: observedDb };
};

const registerTraceWatchers = async (
  watcherArgs: Pick<ITraceWatcherConfig, 'storage' | 'config' | 'db'>
): Promise<void> => {
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
};

const activateTrace = async (
  core: CoreApi,
  Env: TraceEnvApi,
  startupOverrides: TraceConfigOverrides | undefined
): Promise<void> => {
  const config = buildTraceRuntimeConfig(Env, startupOverrides);
  if (!config.enabled) return;

  const watcherArgs = await createTraceWatcherArgs(core, Env, config);

  if (core.RequestContext) {
    TraceContext.setRequestContextImpl(
      core.RequestContext as {
        current?: () => unknown;
        peek?: () => unknown;
      }
    );
  }

  await registerTraceWatchers(watcherArgs);
};

const initializeTraceRegister = async (): Promise<void> => {
  const core = (await importCore()) as CoreApi;
  const Env = core.Env;
  const startupOverrides = await resolveTraceStartupOverrides(core);

  if (!traceAlreadyInitialized && Env) {
    await activateTrace(core, Env, startupOverrides);

    return;
  }

  if (!traceAlreadyInitialized) {
    // Running outside a ZinTrust project - skip init silently.
    // eslint-disable-next-line no-console
    console.warn('[trace] @zintrust/core not found - trace will not be activated.');
  }
};

export const registerTraceReady = initializeTraceRegister();
