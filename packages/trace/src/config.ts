/**
 * TraceConfig — defaults and merge helper for @zintrust/trace
 */
import type {
  ITraceConfig,
  TraceClientRequestCaptureRule,
  TraceClientRequestWatcherToggle,
  TraceConfigOverrides,
  TraceContentDispatchConfig,
  TraceFilterRule,
  TraceRequestWatcherConfig,
  TraceWatcherToggle,
} from './types';

const mergeStringLists = (base: string[], override?: string[]): string[] => {
  const merged = new Set<string>();

  for (const value of [...base, ...(override ?? [])]) {
    if (typeof value !== 'string') continue;
    const normalized = value.trim();
    if (normalized !== '') merged.add(normalized);
  }

  return [...merged];
};

const isObjectValue = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
};

const resolveEnabled = (
  base?: TraceFilterRule,
  override?: TraceFilterRule
): boolean | undefined => {
  return override?.enabled ?? base?.enabled;
};

const hasMergedRuleValues = (
  include: string[],
  exclude: string[],
  enabled: boolean | undefined
): boolean => {
  return include.length > 0 || exclude.length > 0 || enabled !== undefined;
};

const buildFilterRule = (input: {
  include: string[];
  exclude: string[];
  enabled: boolean | undefined;
}): TraceFilterRule => {
  return Object.freeze({
    ...(input.enabled === undefined ? {} : { enabled: input.enabled }),
    ...(input.include.length > 0 ? { include: input.include } : {}),
    ...(input.exclude.length > 0 ? { exclude: input.exclude } : {}),
  });
};

const mergeFilterRule = (
  base?: TraceFilterRule,
  override?: TraceFilterRule
): TraceFilterRule | undefined => {
  const include = mergeStringLists(base?.include ?? [], override?.include);
  const exclude = mergeStringLists(base?.exclude ?? [], override?.exclude);
  const enabled = resolveEnabled(base, override);

  if (!hasMergedRuleValues(include, exclude, enabled)) return undefined;

  return buildFilterRule({ include, exclude, enabled });
};

const mergeWatcherToggle = (
  base?: TraceWatcherToggle,
  override?: TraceWatcherToggle
): TraceWatcherToggle | undefined => {
  if (override === undefined) return base;
  if (override === false || override === true) return override;

  const baseRule = isObjectValue(base) ? base : undefined;
  return mergeFilterRule(baseRule, override);
};

type ClientRequestCaptureFlags = Pick<
  TraceClientRequestCaptureRule,
  'requestHeaders' | 'requestBody' | 'responseHeaders' | 'responseBody'
>;

const resolveClientRequestCaptureFlags = (
  base?: TraceClientRequestCaptureRule,
  override?: TraceClientRequestCaptureRule
): ClientRequestCaptureFlags => {
  return {
    requestHeaders: override?.requestHeaders ?? base?.requestHeaders,
    requestBody: override?.requestBody ?? base?.requestBody,
    responseHeaders: override?.responseHeaders ?? base?.responseHeaders,
    responseBody: override?.responseBody ?? base?.responseBody,
  };
};

const hasClientRequestCaptureFlags = (flags: ClientRequestCaptureFlags): boolean => {
  return Object.values(flags).some((value) => value !== undefined);
};

const buildClientRequestCaptureRule = (
  mergedRule: TraceFilterRule | undefined,
  flags: ClientRequestCaptureFlags
): TraceClientRequestCaptureRule => {
  const baseRule = mergedRule ? { ...mergedRule } : {};

  return Object.freeze({
    ...baseRule,
    ...(flags.requestHeaders === undefined ? {} : { requestHeaders: flags.requestHeaders }),
    ...(flags.requestBody === undefined ? {} : { requestBody: flags.requestBody }),
    ...(flags.responseHeaders === undefined ? {} : { responseHeaders: flags.responseHeaders }),
    ...(flags.responseBody === undefined ? {} : { responseBody: flags.responseBody }),
  });
};

const mergeClientRequestCaptureRule = (
  base?: TraceClientRequestCaptureRule,
  override?: TraceClientRequestCaptureRule
): TraceClientRequestCaptureRule | undefined => {
  const mergedRule = mergeFilterRule(base, override);
  const flags = resolveClientRequestCaptureFlags(base, override);

  if (mergedRule === undefined && !hasClientRequestCaptureFlags(flags)) {
    return undefined;
  }

  return buildClientRequestCaptureRule(mergedRule, flags);
};

const collectClientRequestSourceKeys = (
  base?: TraceClientRequestWatcherToggle,
  override?: Exclude<TraceClientRequestWatcherToggle, boolean>
): string[] => {
  const overrideSources = override?.sources ?? {};
  const sourceKeys = new Set<string>([
    ...Object.keys(isObjectValue(base) ? (base.sources ?? {}) : {}),
    ...Object.keys(overrideSources),
  ]);

  return [...sourceKeys];
};

const mergeClientRequestSources = (
  base?: TraceClientRequestWatcherToggle,
  override?: Exclude<TraceClientRequestWatcherToggle, boolean>
): Record<string, TraceClientRequestCaptureRule> | undefined => {
  if (override === undefined) return undefined;

  const sources: Record<string, TraceClientRequestCaptureRule> = {};

  for (const key of collectClientRequestSourceKeys(base, override)) {
    const baseSources = isObjectValue(base) ? base.sources : undefined;
    const sourceRule = mergeClientRequestCaptureRule(baseSources?.[key], override.sources?.[key]);
    if (sourceRule !== undefined) {
      sources[key] = sourceRule;
    }
  }

  return Object.keys(sources).length === 0 ? undefined : sources;
};

const mergeClientRequestWatcherToggle = (
  base?: TraceClientRequestWatcherToggle,
  override?: TraceClientRequestWatcherToggle
): TraceClientRequestWatcherToggle | undefined => {
  if (override === undefined) return base;
  if (override === false || override === true) return override;

  const baseConfig = isObjectValue(base) ? base : undefined;
  const merged = mergeClientRequestCaptureRule(baseConfig, override) ?? {};
  const sources = mergeClientRequestSources(base, override);

  if (sources === undefined) {
    return merged;
  }

  return Object.freeze({
    ...merged,
    sources,
  });
};

const REQUEST_METHOD_KEYS = ['all', 'get', 'post', 'put', 'patch', 'delete'] as const;

const mergeRequestWatcherToggle = (
  base?: ITraceConfig['watchers']['request'],
  override?: ITraceConfig['watchers']['request']
): ITraceConfig['watchers']['request'] | undefined => {
  if (override === undefined) return base;
  if (override === false || override === true) return override;

  const baseConfig = isObjectValue(base) ? base : undefined;
  const merged: TraceRequestWatcherConfig = mergeFilterRule(baseConfig, override) ?? {};

  for (const key of REQUEST_METHOD_KEYS) {
    const rule = mergeFilterRule(baseConfig?.[key], override[key]);
    if (rule !== undefined) merged[key] = rule;
  }

  return merged;
};

const mergeWatchers = (
  base: ITraceConfig['watchers'],
  override?: TraceConfigOverrides['watchers']
): ITraceConfig['watchers'] => {
  if (override === undefined) return { ...base };

  return {
    ...base,
    ...override,
    request: mergeRequestWatcherToggle(base.request, override.request),
    query: mergeWatcherToggle(base.query, override.query),
    exception: mergeWatcherToggle(base.exception, override.exception),
    log: mergeWatcherToggle(base.log, override.log),
    job: mergeWatcherToggle(base.job, override.job),
    cache: mergeWatcherToggle(base.cache, override.cache),
    schedule: mergeWatcherToggle(base.schedule, override.schedule),
    mail: mergeWatcherToggle(base.mail, override.mail),
    auth: mergeWatcherToggle(base.auth, override.auth),
    event: mergeWatcherToggle(base.event, override.event),
    model: mergeWatcherToggle(base.model, override.model),
    notification: mergeWatcherToggle(base.notification, override.notification),
    redis: mergeWatcherToggle(base.redis, override.redis),
    gate: mergeWatcherToggle(base.gate, override.gate),
    middleware: mergeWatcherToggle(base.middleware, override.middleware),
    command: mergeWatcherToggle(base.command, override.command),
    batch: mergeWatcherToggle(base.batch, override.batch),
    dump: mergeWatcherToggle(base.dump, override.dump),
    view: mergeWatcherToggle(base.view, override.view),
    clientRequest: mergeClientRequestWatcherToggle(base.clientRequest, override.clientRequest),
  };
};

const mergeContentDispatch = (
  base: TraceContentDispatchConfig,
  override?: TraceConfigOverrides['contentDispatch']
): TraceContentDispatchConfig => {
  return {
    ...base,
    ...override,
    worker: {
      ...base.worker,
      ...(override?.worker ?? {}),
    },
  };
};

const DEFAULTS: ITraceConfig = Object.freeze({
  enabled: false,
  connection: undefined,
  observeConnection: undefined,
  pruneAfterHours: 24,
  ignoreRoutes: ['/trace', '/health', '/ping'],
  slowQueryThreshold: 100,
  captureCachePayloads: false,
  captureQueryBindings: true,
  logMinLevel: 'info',
  contentDispatch: {
    driver: undefined,
    queueName: 'trace-content',
    enqueueTimeoutMs: 25,
    worker: {
      enabled: true,
      intervalMs: 1000,
      maxDurationMs: 250,
      concurrency: 1,
    },
  },
  watchers: {},
  redaction: {
    keys: [
      'password',
      'pass',
      'passwd',
      'token',
      'accessToken',
      'access_token',
      'refreshToken',
      'refresh_token',
      'secret',
      'secretKey',
      'secret_key',
      'apiKey',
      'api_key',
      'auth',
      'authToken',
      'auth_token',
      'authorization',
      'cookie',
      'session',
      'sessionId',
      'session_id',
      'card',
      'cardNumber',
      'card_number',
      'cardToken',
      'card_token',
      'cvv',
      'cvc',
      'pan',
    ],
    headers: ['authorization', 'cookie', 'x-api-key', 'x-auth-token'],
    body: ['password', 'token', 'secret', 'apiKey', 'api_key', 'jwt', 'bearer'],
    query: [],
  },
} satisfies ITraceConfig);

const isWatcherEnabled = (config: ITraceConfig, key: keyof ITraceConfig['watchers']): boolean => {
  const override = config.watchers[key];
  if (override === false) return false;
  if (isObjectValue(override) && override.enabled === false) return false;
  return true; // undefined = enabled by default; explicit false = disabled
};

const getRedactionFields = (
  config: ITraceConfig,
  key: keyof ITraceConfig['redaction']
): string[] => {
  if (key === 'keys') {
    return mergeStringLists([], config.redaction.keys);
  }

  return mergeStringLists(config.redaction.keys, config.redaction[key]);
};

export const TraceConfig = Object.freeze({
  defaults(): ITraceConfig {
    return DEFAULTS;
  },

  merge(overrides?: TraceConfigOverrides): ITraceConfig {
    if (overrides === undefined || overrides === null) return DEFAULTS;
    return Object.freeze({
      ...DEFAULTS,
      ...overrides,
      contentDispatch: mergeContentDispatch(DEFAULTS.contentDispatch, overrides.contentDispatch),
      watchers: mergeWatchers(DEFAULTS.watchers, overrides.watchers),
      redaction: {
        keys: mergeStringLists(DEFAULTS.redaction.keys, overrides.redaction?.keys),
        headers: mergeStringLists(DEFAULTS.redaction.headers, overrides.redaction?.headers),
        body: mergeStringLists(DEFAULTS.redaction.body, overrides.redaction?.body),
        query: mergeStringLists(DEFAULTS.redaction.query, overrides.redaction?.query),
      },
      ignoreRoutes: overrides.ignoreRoutes ?? DEFAULTS.ignoreRoutes,
    });
  },

  getRedactionFields,
  isWatcherEnabled,
});
