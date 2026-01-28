/**
 * Optional OpenTelemetry integration.
 *
 * Design goals:
 * - No hard dependency on SDKs/exporters (apps bring their own).
 * - Safe to import in runtimes without tracing configured (no-op behavior).
 * - Best-effort: never breaks request handling.
 *
 * Tiny Node enablement snippet (exporter is app-owned):
 *
 *   npm i @opentelemetry/sdk-node @opentelemetry/auto-instrumentations-node \
 *     @opentelemetry/exporter-trace-otlp-http
 *
 *   // in your app entrypoint (before creating the server)
 *   import { NodeSDK } from '@opentelemetry/sdk-node';
 *   import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
 *   import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
 *
 *   const sdk = new NodeSDK({
 *     traceExporter: new OTLPTraceExporter({ url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT }),
 *     instrumentations: [getNodeAutoInstrumentations()],
 *   });
 *   await sdk.start();
 *   process.env.OTEL_ENABLED = 'true';
 */

import { Env } from '@config/env';
import { createRequire } from '@node-singletons/module';
import type { Context, Span } from '@opentelemetry/api';

type OpenTelemetryApi = typeof import('@opentelemetry/api');

let cachedApi: OpenTelemetryApi | null | undefined;

const resolveOpenTelemetryApi = (): OpenTelemetryApi | null => {
  const injected = (
    globalThis as unknown as { __zintrustOpenTelemetryApi?: OpenTelemetryApi | null }
  ).__zintrustOpenTelemetryApi;
  if (injected !== undefined && injected !== null) {
    cachedApi = injected;
    return cachedApi;
  }

  if (cachedApi !== undefined) return cachedApi;

  try {
    const require = createRequire(import.meta.url);

    cachedApi = require('@opentelemetry/api') as OpenTelemetryApi;
    return cachedApi;
  } catch {
    cachedApi = null;
    return null;
  }
};

const noopSpan: Span = {
  setAttribute: () => undefined,
  updateName: () => undefined,
  setStatus: () => undefined,
  end: () => undefined,
} as unknown as Span;

const fallbackContext = {
  active: () => ({}) as Context,
  with: <A extends unknown[], F extends (...args: A) => ReturnType<F>>(
    _ctx: Context,
    fn: F,
    _thisArg?: ThisParameterType<F>,
    ...args: A
  ): ReturnType<F> => fn(...args),
};

const fallbackPropagation = {
  extract: (_ctx: Context) => _ctx,
  inject: () => undefined,
};

const fallbackTrace = {
  getTracer: () => ({
    startSpan: () => noopSpan,
  }),
  getSpan: () => undefined,
  setSpan: (ctx: Context) => ctx,
};

const fallbackSpanKind = {
  SERVER: 1,
  CLIENT: 2,
} as const;

const fallbackSpanStatusCode = {
  OK: 1,
  ERROR: 2,
} as const;

const otel = (): OpenTelemetryApi | null => resolveOpenTelemetryApi();

export interface StartHttpServerSpanInput {
  method: string;
  path: string;
  requestId?: string;
  serviceName?: string;
  userId?: string;
  tenantId?: string;
  userAgent?: string;
}

export interface EndHttpServerSpanInput {
  route?: string;
  status?: number;
  error?: unknown;
}

export interface StartedSpan {
  span: Span;
  context: Context;
}

export interface RecordDbQuerySpanInput {
  driver: string;
  durationMs: number;
}

type HeaderGetter = {
  getHeader(name: string): unknown;
};

const isEnabled = (): boolean => {
  return Env.getBool('OTEL_ENABLED', false);
};

const extractContextFromHeaders = (req: HeaderGetter): Context => {
  const active = otel()?.context?.active() ?? fallbackContext.active();

  try {
    const extractor = otel()?.propagation?.extract ?? fallbackPropagation.extract;
    return extractor(active, req, {
      get(carrier: HeaderGetter, key: string) {
        const value = carrier.getHeader(key);
        if (typeof value === 'string') return value;
        if (Array.isArray(value)) return value.join(',');
        return undefined;
      },
      keys() {
        return [];
      },
    });
  } catch {
    return active;
  }
};

const startHttpServerSpan = (req: HeaderGetter, input: StartHttpServerSpanInput): StartedSpan => {
  const parent = extractContextFromHeaders(req);
  const tracer = (otel()?.trace ?? fallbackTrace).getTracer('zintrust');

  const span = tracer.startSpan(
    `${input.method} unmatched`,
    {
      kind: (otel()?.SpanKind ?? fallbackSpanKind).SERVER,
      attributes: {
        'http.method': input.method,
        'http.target': input.path,
        'http.user_agent': input.userAgent ?? '',
        'service.name': input.serviceName ?? '',
        'enduser.id': input.userId ?? '',
        'zintrust.tenant_id': input.tenantId ?? '',
        'zintrust.request_id': input.requestId ?? '',
      },
    },
    parent
  );

  const spanContext = (otel()?.trace ?? fallbackTrace).setSpan(parent, span);
  return { span, context: spanContext };
};

const runWithContext = async <T>(ctx: Context, fn: () => Promise<T>): Promise<T> => {
  const runner = otel()?.context?.with ?? fallbackContext.with;
  return runner(ctx, fn);
};

const setHttpRoute = (span: Span, method: string, route: string): void => {
  try {
    span.setAttribute('http.route', route);
    span.updateName(`${method} ${route}`);
  } catch {
    // best-effort
  }
};

const endHttpServerSpan = (span: Span, input: EndHttpServerSpanInput): void => {
  try {
    if (input.route !== undefined && input.route.trim() !== '') {
      span.setAttribute('http.route', input.route);
    }

    if (typeof input.status === 'number') {
      span.setAttribute('http.status_code', input.status);

      if (input.status >= 500) {
        span.setStatus({ code: (otel()?.SpanStatusCode ?? fallbackSpanStatusCode).ERROR });
      } else {
        span.setStatus({ code: (otel()?.SpanStatusCode ?? fallbackSpanStatusCode).OK });
      }
    }

    if (input.error !== undefined) {
      // Avoid throwing; represent as a string attribute.
      span.setAttribute(
        'zintrust.error',
        input.error instanceof Error ? input.error.message : String(input.error)
      );
      span.setStatus({ code: (otel()?.SpanStatusCode ?? fallbackSpanStatusCode).ERROR });
    }

    span.end();
  } catch {
    // best-effort
  }
};

const injectTraceHeaders = (headers: Record<string, string>): Record<string, string> => {
  try {
    const injector = otel()?.propagation?.inject ?? fallbackPropagation.inject;
    injector(otel()?.context?.active() ?? fallbackContext.active(), headers);
  } catch {
    // best-effort
  }

  return headers;
};

const mapDbSystem = (driver: string): string => {
  switch (driver) {
    case 'postgresql':
      return 'postgresql';
    case 'mysql':
      return 'mysql';
    case 'sqlserver':
      return 'mssql';
    case 'd1':
    case 'd1-remote':
    case 'sqlite':
    default:
      return 'sqlite';
  }
};

const recordDbQuerySpan = (input: RecordDbQuerySpanInput): void => {
  if (isEnabled() === false) return;

  try {
    // Only create a DB span if we're already inside a request trace.
    const traceApi = otel()?.trace ?? fallbackTrace;
    const parentSpan = traceApi.getSpan(otel()?.context?.active() ?? fallbackContext.active());
    if (!parentSpan) return;

    const tracer = traceApi.getTracer('zintrust');
    const now = Date.now();
    const durationMs = Number.isFinite(input.durationMs) ? Math.max(0, input.durationMs) : 0;
    const startTime = now - durationMs;

    const span = tracer.startSpan(
      'db.query',
      {
        kind: (otel()?.SpanKind ?? fallbackSpanKind).CLIENT,
        startTime,
        attributes: {
          'db.system': mapDbSystem(input.driver),
          'db.operation': 'query',
          'zintrust.db.driver': input.driver,
        },
      },
      otel()?.context?.active() ?? fallbackContext.active()
    );

    span.end(now);
  } catch {
    // best-effort
  }
};

export const OpenTelemetry = Object.freeze({
  isEnabled,
  startHttpServerSpan,
  runWithContext,
  setHttpRoute,
  endHttpServerSpan,
  injectTraceHeaders,
  recordDbQuerySpan,
});

export default OpenTelemetry;
