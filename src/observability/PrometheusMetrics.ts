/**
 * Prometheus Metrics (prom-client)
 *
 * Lazy-initialized so importing this module is safe in non-Node runtimes.
 */

import { Env } from '@config/env';

import type { Counter, Histogram, Registry } from 'prom-client';

type PromClientModule = typeof import('prom-client');

type MetricsState = {
  client: PromClientModule;
  registry: Registry;
  httpRequestsTotal: Counter<string>;
  httpRequestDurationSeconds: Histogram<string>;
  dbQueriesTotal: Counter<string>;
  dbQueryDurationSeconds: Histogram<string>;
};

let statePromise: Promise<MetricsState> | null = null;

async function ensureState(): Promise<MetricsState> {
  if (statePromise !== null) return statePromise;

  statePromise = (async () => {
    const client: PromClientModule = await import('prom-client');

    const registry = new client.Registry();
    const appName = Env.get('APP_NAME', 'ZinTrust');
    if (appName.trim() !== '') {
      registry.setDefaultLabels({ app: appName });
    }

    // Default metrics (process/memory/event loop) for Node runtimes.
    // `collectDefaultMetrics` exists in prom-client; keep this lazy and best-effort.
    try {
      client.collectDefaultMetrics({ register: registry });
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
        : 'text/plain; version=0.0.4; charset=utf-8';

    return { contentType, body };
  },

  async observeHttpRequest(input: ObserveHttpRequestInput): Promise<void> {
    const state = await ensureState();

    const method = input.method || 'UNKNOWN';
    const route = input.route || 'unknown';
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
});

export default PrometheusMetrics;
