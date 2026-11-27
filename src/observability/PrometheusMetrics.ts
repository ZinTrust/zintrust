/**
 * Prometheus Metrics (prom-client)
 *
 * Lazy-initialized so importing this module is safe in non-Node runtimes.
 */

import { Env } from '@config/env';

import type { Counter, Histogram, Registry } from 'prom-client';

type PromClientModule = typeof import('prom-client');

/** Structural type for the handle returned by prom-client's collectDefaultMetrics. */
type DefaultMetricsTimer = { unref?: () => void };

type MetricsState = {
  client: PromClientModule;
  registry: Registry;
  httpRequestsTotal: Counter<string>;
  httpRequestDurationSeconds: Histogram<string>;
  dbQueriesTotal: Counter<string>;
  dbQueryDurationSeconds: Histogram<string>;
  defaultMetricsTimer?: DefaultMetricsTimer;
};

let statePromise: Promise<MetricsState> | null = null;

const DEFAULT_CONTENT_TYPE = 'text/plain; version=0.0.4; charset=utf-8';
const PROM_CLIENT_PACKAGE = 'prom-client';

const ALLOWED_HTTP_METHODS = new Set([
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'HEAD',
  'OPTIONS',
]);
const MAX_LABEL_LENGTH = 128;
const MAX_DISTINCT_ROUTES = 500;
const seenRoutes = new Set<string>();

const normalizeHttpMethod = (raw: string): string => {
  const method = raw.trim().toUpperCase();
  return ALLOWED_HTTP_METHODS.has(method) ? method : 'OTHER';
};

const normalizeLabel = (raw: string, fallback: string): string => {
  const value = raw.trim();
  if (value === '') return fallback;
  return value.length > MAX_LABEL_LENGTH ? `${value.slice(0, MAX_LABEL_LENGTH - 1)}~` : value;
};

/**
 * Bound the `route` label so attacker-controlled paths cannot create unlimited time series.
 * The kernel already supplies a route template (or 'unmatched' for 404s); this is a backstop
 * for direct callers.
 */
const normalizeRouteLabel = (raw: string): string => {
  const route = normalizeLabel(raw, 'unknown');
  if (route === 'unmatched' || route === 'unknown' || route === 'other') return route;
  if (seenRoutes.has(route)) return route;
  if (seenRoutes.size >= MAX_DISTINCT_ROUTES) return 'other';
  seenRoutes.add(route);
  return route;
};

const createNoopState = (): MetricsState => {
  const noopCounter = { inc: () => undefined } as unknown as Counter<string>;
  const noopHistogram = { observe: () => undefined } as unknown as Histogram<string>;
  const noopRegistry = {
    contentType: DEFAULT_CONTENT_TYPE,
    metrics: () => '',
  } as unknown as Registry;

  return {
    client: {} as PromClientModule,
    registry: noopRegistry,
    httpRequestsTotal: noopCounter,
    httpRequestDurationSeconds: noopHistogram,
    dbQueriesTotal: noopCounter,
    dbQueryDurationSeconds: noopHistogram,
    defaultMetricsTimer: undefined,
  };
};

async function ensureState(): Promise<MetricsState> {
  if (statePromise !== null) return statePromise;

  statePromise = (async () => {
    let client: PromClientModule;
    try {
      client = (await import(/* @vite-ignore */ PROM_CLIENT_PACKAGE)) as PromClientModule;
    } catch {
      // prom-client is intentionally optional at runtime.
      return createNoopState();
    }

    const registry = new client.Registry();
    const appName = Env.get('APP_NAME', 'ZinTrust');
    if (appName.trim() !== '') {
      registry.setDefaultLabels({ app: appName });
    }

    // Default metrics (process/memory/event loop) for Node runtimes.
    // Keep the timer handle so dispose() can stop it on shutdown / hot reload.
    let defaultMetricsTimer: DefaultMetricsTimer | undefined;
    try {
      defaultMetricsTimer = client.collectDefaultMetrics({
        register: registry,
      }) as unknown as DefaultMetricsTimer;
      defaultMetricsTimer?.unref?.();
    } catch {
      // ignore
    }

    const httpRequestsTotal: Counter<string> = new client.Counter({
      name: 'http_requests_total',
      help: 'Total number of HTTP requests',
      labelNames: ['method', 'route', 'status'],
      registers: [registry],
    });

    const httpRequestDurationSeconds: Histogram<string> = new client.Histogram({
      name: 'http_request_duration_seconds',
      help: 'HTTP request duration in seconds',
      labelNames: ['method', 'route', 'status'],
      // Sensible default buckets for web apps (in seconds)
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
      registers: [registry],
    });

    const dbQueriesTotal: Counter<string> = new client.Counter({
      name: 'db_queries_total',
      help: 'Total number of database queries',
      labelNames: ['driver'],
      registers: [registry],
    });

    const dbQueryDurationSeconds: Histogram<string> = new client.Histogram({
      name: 'db_query_duration_seconds',
      help: 'Database query duration in seconds',
      labelNames: ['driver'],
      buckets: [0.001, 0.0025, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
      registers: [registry],
    });

    return {
      client,
      registry,
      httpRequestsTotal,
      httpRequestDurationSeconds,
      dbQueriesTotal,
      dbQueryDurationSeconds,
      defaultMetricsTimer,
    };
  })();

  return statePromise;
}

export type ObserveHttpRequestInput = {
  method: string;
  route: string;
  status: number;
  durationMs: number;
};

export type ObserveDbQueryInput = {
  driver: string;
  durationMs: number;
};

export const PrometheusMetrics = Object.freeze({
  async getMetricsText(): Promise<{ contentType: string; body: string }> {
    const state = await ensureState();
    const body = await state.registry.metrics();
    const contentType =
      typeof (state.registry as unknown as { contentType?: unknown }).contentType === 'string'
        ? (state.registry as unknown as { contentType: string }).contentType
        : DEFAULT_CONTENT_TYPE;

    return { contentType, body };
  },

  async observeHttpRequest(input: ObserveHttpRequestInput): Promise<void> {
    const state = await ensureState();

    const method = normalizeHttpMethod(input.method ?? '');
    const route = normalizeRouteLabel(input.route ?? '');
    const status = Number.isFinite(input.status) ? String(input.status) : '0';
    const durationSeconds = Math.max(0, input.durationMs / 1000);

    state.httpRequestsTotal.inc({ method, route, status }, 1);
    state.httpRequestDurationSeconds.observe({ method, route, status }, durationSeconds);
  },

  async observeDbQuery(input: ObserveDbQueryInput): Promise<void> {
    const state = await ensureState();

    const driver = input.driver || 'unknown';
    const durationSeconds = Math.max(0, input.durationMs / 1000);

    state.dbQueriesTotal.inc({ driver }, 1);
    state.dbQueryDurationSeconds.observe({ driver }, durationSeconds);
  },

  /**
   * Stop the default-metrics timer and reset lazy state. Useful for shutdown and tests.
   */
  async dispose(): Promise<void> {
    if (statePromise === null) return;
    try {
      const state = await statePromise;
      if (state.defaultMetricsTimer !== undefined) {
        clearInterval(
          state.defaultMetricsTimer as unknown as ReturnType<typeof setInterval>
        );
      }
    } catch {
      // best-effort
    }
    statePromise = null;
  },
});

export default PrometheusMetrics;
