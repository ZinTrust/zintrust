/**
 * TraceConfig — defaults and merge helper for @zintrust/trace
 */
import type { ITraceConfig, TraceConfigOverrides } from './types';

const DEFAULTS: ITraceConfig = Object.freeze({
  enabled: false,
  connection: undefined,
  pruneAfterHours: 24,
  ignoreRoutes: ['/trace', '/health', '/ping'],
  slowQueryThreshold: 100,
  logMinLevel: 'info',
  watchers: {},
  redaction: {
    headers: ['authorization', 'cookie', 'x-api-key', 'x-auth-token'],
    body: ['password', 'token', 'secret', 'apiKey', 'api_key', 'jwt', 'bearer'],
    query: [],
  },
} satisfies ITraceConfig);

const isWatcherEnabled = (config: ITraceConfig, key: keyof ITraceConfig['watchers']): boolean => {
  const override = config.watchers[key];
  return override !== false; // undefined = enabled by default; explicit false = disabled
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
      watchers: { ...DEFAULTS.watchers, ...overrides.watchers },
      redaction: {
        ...DEFAULTS.redaction,
        ...(overrides.redaction ?? {}),
      },
      ignoreRoutes: overrides.ignoreRoutes ?? DEFAULTS.ignoreRoutes,
    });
  },

  isWatcherEnabled,
});
