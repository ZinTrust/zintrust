/**
 * TraceConfig — defaults and merge helper for @zintrust/trace
 */
import type { ITraceConfig, TraceConfigOverrides } from './types';

const mergeStringLists = (base: string[], override?: string[]): string[] => {
  const merged = new Set<string>();

  for (const value of [...base, ...(override ?? [])]) {
    if (typeof value !== 'string') continue;
    const normalized = value.trim();
    if (normalized !== '') merged.add(normalized);
  }

  return [...merged];
};

const DEFAULTS: ITraceConfig = Object.freeze({
  enabled: false,
  connection: undefined,
  pruneAfterHours: 24,
  ignoreRoutes: ['/trace', '/health', '/ping'],
  slowQueryThreshold: 100,
  logMinLevel: 'info',
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
  return override !== false; // undefined = enabled by default; explicit false = disabled
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
      watchers: { ...DEFAULTS.watchers, ...overrides.watchers },
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
