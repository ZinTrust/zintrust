/**
 * DebuggerConfig — defaults and merge helper for @zintrust/system-debugger
 */
import type { DebuggerConfigOverrides, IDebuggerConfig } from './types';

const DEFAULTS: IDebuggerConfig = Object.freeze({
  enabled: false,
  connection: undefined,
  pruneAfterHours: 24,
  ignoreRoutes: ['/debugger', '/health', '/ping'],
  slowQueryThreshold: 100,
  logMinLevel: 'info',
  watchers: {},
  redaction: {
    headers: ['authorization', 'cookie', 'x-api-key', 'x-auth-token'],
    body: ['password', 'token', 'secret', 'apiKey', 'api_key', 'jwt', 'bearer'],
    query: [],
  },
} satisfies IDebuggerConfig);

const isWatcherEnabled = (
  config: IDebuggerConfig,
  key: keyof IDebuggerConfig['watchers']
): boolean => {
  const override = config.watchers[key];
  return override !== false; // undefined = enabled by default; explicit false = disabled
};

export const DebuggerConfig = Object.freeze({
  defaults(): IDebuggerConfig {
    return DEFAULTS;
  },

  merge(overrides?: DebuggerConfigOverrides): IDebuggerConfig {
    if (overrides === undefined || overrides === null) return DEFAULTS;
    return Object.freeze({
      ...DEFAULTS,
      ...overrides,
      watchers: { ...DEFAULTS.watchers, ...(overrides.watchers ?? {}) },
      redaction: {
        ...DEFAULTS.redaction,
        ...(overrides.redaction ?? {}),
      },
      ignoreRoutes: overrides.ignoreRoutes ?? DEFAULTS.ignoreRoutes,
    });
  },

  isWatcherEnabled,
});
