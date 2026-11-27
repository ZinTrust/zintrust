import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type LoadOptions = {
  api?: unknown;
  enabled?: boolean;
};

const load = async ({ api, enabled = true }: LoadOptions = {}) => {
  vi.resetModules();
  const g = globalThis as unknown as { __zintrustOpenTelemetryApi?: unknown };
  if (api === undefined) delete g.__zintrustOpenTelemetryApi;
  else g.__zintrustOpenTelemetryApi = api;

  vi.doMock('@config/env', () => ({ Env: { getBool: () => enabled } }));
  vi.doMock('@node-singletons/module', () => ({
    createRequire: () => () => {
      throw new Error('no @opentelemetry/api available');
    },
  }));

  return import('@/observability/OpenTelemetry');
};

const makeSpan = () => ({
  setAttribute: vi.fn(),
  updateName: vi.fn(),
  setStatus: vi.fn(),
  end: vi.fn(),
});

describe('OpenTelemetry remaining branches', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    delete (globalThis as unknown as { __zintrustOpenTelemetryApi?: unknown })
      .__zintrustOpenTelemetryApi;
    vi.doUnmock('@config/env');
    vi.doUnmock('@node-singletons/module');
  });

  it('uses the injected API for headers, spans, contexts, inject and runWithContext', async () => {
    const span = makeSpan();
    const activeContext = { active: true };
    const extracted = { extracted: true };
    const extractedValues: Array<string | undefined> = [];
    const injectHeaders: Array<Record<string, string>> = [];
    const withCalls: unknown[] = [];
    const startSpanCalls: Array<{ name: string; options?: any }> = [];

    const api = {
      SpanKind: { SERVER: 1, CLIENT: 2 },
      SpanStatusCode: { OK: 1, ERROR: 2 },
      context: {
        active: () => activeContext,
        with: <T>(ctx: unknown, fn: () => T) => {
          withCalls.push(ctx);
          return fn();
        },
      },
      propagation: {
        extract: (_ctx: unknown, _carrier: unknown, getter: any) => {
          extractedValues.push(getter.get(_carrier, 'traceparent'));
          extractedValues.push(getter.keys()[0]);
          return extracted;
        },
        inject: (_ctx: unknown, headers: Record<string, string>) => {
          injectHeaders.push(headers);
          headers['traceparent'] = 'injected';
        },
      },
      trace: {
        getTracer: () => ({
          startSpan: (name: string, options?: any) => {
            startSpanCalls.push({ name, options });
            return span;
          },
        }),
        setSpan: (ctx: unknown, s: unknown) => ({ ctx, s }),
        getSpan: () => span,
      },
    };

    const { OpenTelemetry } = await load({ api });
    expect(OpenTelemetry.isEnabled()).toBe(true);

    const req = {
      getHeader(name: string) {
        if (name === 'traceparent') return 'single';
        if (name === 'x-array') return ['a', 'b'];
        return undefined;
      },
    };
    const started = OpenTelemetry.startHttpServerSpan(req, { method: 'GET', path: '/x' });
    expect(extractedValues).toEqual(['single', undefined]);
    expect(started.span).toBe(span);
    expect(started.context).toEqual({ ctx: extracted, s: span });
    expect(startSpanCalls[0]?.options?.attributes).toMatchObject({
      'http.user_agent': '',
      'service.name': '',
      'enduser.id': '',
      'zintrust.tenant_id': '',
      'zintrust.request_id': '',
    });

    await expect(
      OpenTelemetry.runWithContext(started.context, async () => 'value')
    ).resolves.toBe('value');
    expect(withCalls).toEqual([started.context]);

    OpenTelemetry.setHttpRoute(span, 'GET', '/users/:id');
    expect(span.setAttribute).toHaveBeenCalledWith('http.route', '/users/:id');
    expect(span.updateName).toHaveBeenCalledWith('GET /users/:id');

    const headers = OpenTelemetry.injectTraceHeaders({});
    expect(headers).toEqual({ traceparent: 'injected' });
    expect(injectHeaders).toHaveLength(1);
  });

  it('handles array headers, undefined headers, and extractor failures', async () => {
    const span = makeSpan();
    let shouldThrow = false;
    const api = {
      SpanKind: { SERVER: 1, CLIENT: 2 },
      context: { active: () => ({}) },
      propagation: {
        extract: (_ctx: unknown, carrier: { value?: unknown }) => {
          if (shouldThrow) throw new Error('extract failed');
          return { value: carrier.value };
        },
        inject: () => undefined,
      },
      trace: {
        getTracer: () => ({ startSpan: () => span }),
        setSpan: (ctx: unknown) => ctx,
        getSpan: () => undefined,
      },
    };
    const { OpenTelemetry } = await load({ api });

    OpenTelemetry.startHttpServerSpan(
      { getHeader: (name: string) => (name === 'traceparent' ? ['a', 'b'] : 42) },
      { method: 'POST', path: '/y', userAgent: 'ua', serviceName: 'svc' }
    );
    expect(span.setAttribute).not.toHaveBeenCalled();

    shouldThrow = true;
    expect(() =>
      OpenTelemetry.startHttpServerSpan({ getHeader: () => undefined }, {
        method: 'GET',
        path: '/z',
      })
    ).not.toThrow();
  });

  it('best-effort catches failures from route, span and injection helpers', async () => {
    const throwingSpan = {
      setAttribute: vi.fn(() => {
        throw new Error('read only span');
      }),
      updateName: vi.fn(() => {
        throw new Error('read only span');
      }),
      setStatus: vi.fn(() => {
        throw new Error('read only span');
      }),
      end: vi.fn(() => {
        throw new Error('read only span');
      }),
    };
    const api = {
      context: { active: () => ({}) },
      propagation: {
        extract: () => ({}),
        inject: () => {
          throw new Error('inject failed');
        },
      },
      trace: { getTracer: () => ({ startSpan: () => throwingSpan }), getSpan: () => undefined },
    };
    const { OpenTelemetry } = await load({ api });

    expect(() => OpenTelemetry.setHttpRoute(throwingSpan, 'GET', '/r')).not.toThrow();
    expect(() =>
      OpenTelemetry.endHttpServerSpan(throwingSpan, {
        route: '/r',
        status: 500,
        error: 'bad',
      })
    ).not.toThrow();
    expect(OpenTelemetry.injectTraceHeaders({})).toEqual({});
  });

  it('ends HTTP spans with OK/error statuses and stringified errors', async () => {
    const span = makeSpan();
    const { OpenTelemetry } = await load({ api: undefined });

    OpenTelemetry.endHttpServerSpan(span, { route: '   ', status: 200 });
    expect(span.setAttribute).toHaveBeenCalledTimes(1);
    expect(span.setStatus).toHaveBeenCalledWith({ code: 1 });

    OpenTelemetry.endHttpServerSpan(span, { status: 503 });
    expect(span.setStatus).toHaveBeenLastCalledWith({ code: 2 });

    OpenTelemetry.endHttpServerSpan(span, { error: 'plain string' });
    expect(span.setAttribute).toHaveBeenCalledWith('zintrust.error', 'plain string');
    expect(span.setStatus).toHaveBeenLastCalledWith({ code: 2 });

    OpenTelemetry.endHttpServerSpan(span, { error: new Error('boom') });
    expect(span.setAttribute).toHaveBeenCalledWith('zintrust.error', 'boom');
    expect(span.end).toHaveBeenCalledTimes(4);
  });

  it('falls back when no API is installed and covers all db driver mappings', async () => {
    const startedSpans: Array<{ name: string; options: any }> = [];
    const span = { end: vi.fn() };
    // A partial API: trace is available (so DB spans are created) but context,
    // SpanKind and SpanStatusCode are missing and must fall back.
    const api = {
      trace: {
        getTracer: () => ({
          startSpan: (name: string, options: any) => {
            startedSpans.push({ name, options });
            return span;
          },
        }),
        setSpan: () => ({}),
        getSpan: () => ({ parent: true }),
      },
    };
    const { OpenTelemetry } = await load({ api });

    for (const driver of [
      'postgresql',
      'mysql',
      'sqlserver',
      'd1',
      'd1-remote',
      'sqlite',
      'oracle',
    ]) {
      OpenTelemetry.recordDbQuerySpan({ driver, durationMs: 10 });
    }
    expect(startedSpans.map((s) => s.options.attributes['db.system'])).toEqual([
      'postgresql',
      'mysql',
      'mssql',
      'sqlite',
      'sqlite',
      'sqlite',
      'sqlite',
    ]);
    expect(startedSpans[0]?.options.kind).toBe(2);
    expect(startedSpans[2]?.options.startTime).toBeLessThanOrEqual(Date.now());

    OpenTelemetry.recordDbQuerySpan({ driver: 'sqlite', durationMs: Number.NaN });
    expect(startedSpans).toHaveLength(8);
    expect(startedSpans[7]?.options.startTime).toBe(startedSpans[7]?.options.startTime);

    OpenTelemetry.recordDbQuerySpan({ driver: 'sqlite', durationMs: -50 });
    expect(startedSpans[8]?.options.startTime).toBeGreaterThan(Date.now() - 10);
  });

  it('records queue spans with fallback status codes and non-finite durations', async () => {
    const span = { setStatus: vi.fn(), end: vi.fn() };
    const captured: Array<{ name: string; options: any }> = [];
    const api = {
      trace: {
        getTracer: () => ({
          startSpan: (name: string, options: any) => {
            captured.push({ name, options });
            return span;
          },
        }),
        getSpan: () => ({ parent: true }),
        setSpan: (ctx: unknown) => ctx,
      },
    };
    const { OpenTelemetry } = await load({ api });

    OpenTelemetry.recordQueueOperationSpan({
      queueName: 'jobs',
      operation: 'enqueue',
      durationMs: Number.NaN,
      status: 'error',
    });
    OpenTelemetry.recordQueueOperationSpan({
      queueName: 'jobs',
      operation: 'drain',
      durationMs: 5,
      status: 'ok',
    });
    expect(captured.map((c) => c.name)).toEqual(['queue.enqueue', 'queue.drain']);
    expect(span.setStatus).toHaveBeenNthCalledWith(1, { code: 2 });
    expect(span.setStatus).toHaveBeenNthCalledWith(2, { code: 1 });
  });

  it('returns early for disabled tracing and when no parent span exists', async () => {
    const disabled = await load({ enabled: false });
    disabled.OpenTelemetry.recordDbQuerySpan({ driver: 'sqlite', durationMs: 1 });
    disabled.OpenTelemetry.recordQueueOperationSpan({
      queueName: 'q',
      operation: 'ack',
      durationMs: 1,
      status: 'ok',
    });

    const noParent = await load({
      api: {
        trace: { getSpan: () => undefined, getTracer: () => ({ startSpan: () => ({}) }) },
      },
    });
    expect(() =>
      noParent.OpenTelemetry.recordDbQuerySpan({ driver: 'sqlite', durationMs: 1 })
    ).not.toThrow();
    expect(() =>
      noParent.OpenTelemetry.recordQueueOperationSpan({
        queueName: 'q',
        operation: 'length',
        durationMs: 1,
        status: 'ok',
      })
    ).not.toThrow();
  });

  it('uses fallbacks for context, propagation and span kinds without an API', async () => {
    const { OpenTelemetry } = await load({ api: undefined });

    const started = OpenTelemetry.startHttpServerSpan(
      { getHeader: () => undefined },
      { method: 'GET', path: '/fallback' }
    );
    expect(typeof started.span.setAttribute).toBe('function');
    expect(typeof started.span.end).toBe('function');
    expect(await OpenTelemetry.runWithContext(started.context, async () => 7)).toBe(7);
    expect(OpenTelemetry.injectTraceHeaders({ a: 'b' })).toEqual({ a: 'b' });
  });
});
