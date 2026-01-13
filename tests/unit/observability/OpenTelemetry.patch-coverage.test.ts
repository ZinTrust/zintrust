import { describe, expect, it, vi } from 'vitest';

describe('OpenTelemetry patch coverage', () => {
  it('extracts header values, starts/ends spans, and injects trace headers (best-effort)', async () => {
    vi.resetModules();

    const capturedExtractValue: Array<string | undefined> = [];

    const span = {
      setAttribute: vi.fn(),
      updateName: vi.fn(),
      setStatus: vi.fn(),
      end: vi.fn(),
    };

    const dbSpan = {
      end: vi.fn(),
    };

    const tracer = {
      startSpan: vi.fn((name: string, _opts: any) => {
        return name === 'db.query' ? (dbSpan as any) : (span as any);
      }),
    };

    const activeCtxWithSpan = { __hasSpan: true };

    vi.doMock('@config/env', () => ({
      Env: {
        getBool: (key: string, defaultValue: boolean) => {
          if (key === 'OTEL_ENABLED') return true;
          return defaultValue;
        },
      },
    }));

    vi.doMock('@opentelemetry/api', () => {
      return {
        SpanKind: { SERVER: 1, CLIENT: 2 },
        SpanStatusCode: { OK: 1, ERROR: 2 },
        context: {
          active: () => activeCtxWithSpan,
          with: async (_ctx: any, fn: any) => fn(),
        },
        propagation: {
          extract: (_active: any, carrier: any, getter: any) => {
            const v = getter.get(carrier, 'traceparent');
            capturedExtractValue.push(v);
            return { ..._active, extracted: v };
          },
          inject: (_ctx: any, headers: any) => {
            headers.traceparent = '00-abc-123-01';
          },
        },
        trace: {
          getTracer: () => tracer,
          setSpan: (parent: any, _span: any) => ({ ...parent, __spanSet: true }),
          getSpan: (ctx: any) => (ctx && ctx.__hasSpan ? ({ ok: true } as any) : null),
        },
      };
    });

    const { OpenTelemetry } = await import('@/observability/OpenTelemetry');

    const req = {
      getHeader(name: string) {
        if (name === 'traceparent') return ['a', 'b'];
        return undefined;
      },
    };

    const started = OpenTelemetry.startHttpServerSpan(req, {
      method: 'GET',
      path: '/x',
      requestId: 'r1',
      serviceName: 'svc',
      userId: 'u1',
      tenantId: 't1',
      userAgent: 'ua',
    });

    expect(capturedExtractValue).toEqual(['a,b']);
    expect(started.context).toMatchObject({ __hasSpan: true, __spanSet: true });

    OpenTelemetry.setHttpRoute(started.span, 'GET', '/users/:id');
    expect(span.setAttribute).toHaveBeenCalledWith('http.route', '/users/:id');
    expect(span.updateName).toHaveBeenCalledWith('GET /users/:id');

    OpenTelemetry.endHttpServerSpan(started.span, { route: '/users/:id', status: 200 });
    OpenTelemetry.endHttpServerSpan(started.span, { status: 500 });
    OpenTelemetry.endHttpServerSpan(started.span, { error: new Error('boom') });

    const outHeaders = OpenTelemetry.injectTraceHeaders({});
    expect(outHeaders['traceparent']).toBe('00-abc-123-01');

    const dateNow = vi.spyOn(Date, 'now').mockReturnValue(1000);
    OpenTelemetry.recordDbQuerySpan({ driver: 'sqlserver', durationMs: 10 });
    dateNow.mockRestore();

    expect(tracer.startSpan).toHaveBeenCalledWith(
      'db.query',
      expect.objectContaining({
        kind: 2,
        startTime: 990,
        attributes: expect.objectContaining({
          'db.system': 'mssql',
          'zintrust.db.driver': 'sqlserver',
        }),
      }),
      activeCtxWithSpan
    );
    expect(dbSpan.end).toHaveBeenCalledWith(1000);
  });

  it('returns early for db spans when no parent span exists', async () => {
    vi.resetModules();

    const tracer = {
      startSpan: vi.fn(),
    };

    vi.doMock('@config/env', () => ({
      Env: {
        getBool: () => true,
      },
    }));

    vi.doMock('@opentelemetry/api', () => {
      return {
        SpanKind: { SERVER: 1, CLIENT: 2 },
        SpanStatusCode: { OK: 1, ERROR: 2 },
        context: {
          active: () => ({}),
          with: async (_ctx: any, fn: any) => fn(),
        },
        propagation: {
          extract: (active: any) => active,
          inject: () => undefined,
        },
        trace: {
          getTracer: () => tracer,
          setSpan: (parent: any) => parent,
          getSpan: () => null,
        },
      };
    });

    const { OpenTelemetry } = await import('@/observability/OpenTelemetry');

    OpenTelemetry.recordDbQuerySpan({ driver: 'postgresql', durationMs: 1 });
    expect(tracer.startSpan).not.toHaveBeenCalled();
  });

  it('returns active context when propagation.extract throws', async () => {
    vi.resetModules();

    const tracer = {
      startSpan: vi.fn(() => ({
        end: vi.fn(),
        setAttribute: vi.fn(),
        updateName: vi.fn(),
        setStatus: vi.fn(),
      })),
    };

    const active = { active: true };

    vi.doMock('@config/env', () => ({
      Env: {
        getBool: () => false,
      },
    }));

    vi.doMock('@opentelemetry/api', () => {
      return {
        SpanKind: { SERVER: 1, CLIENT: 2 },
        SpanStatusCode: { OK: 1, ERROR: 2 },
        context: {
          active: () => active,
          with: async (_ctx: any, fn: any) => fn(),
        },
        propagation: {
          extract: () => {
            throw new Error('boom');
          },
          inject: () => undefined,
        },
        trace: {
          getTracer: () => tracer,
          setSpan: (parent: any) => parent,
          getSpan: () => null,
        },
      };
    });

    const { OpenTelemetry } = await import('@/observability/OpenTelemetry');

    const req = { getHeader: () => 'x' };
    const started = OpenTelemetry.startHttpServerSpan(req, { method: 'GET', path: '/' });

    expect(started.context).toEqual(active);
  });
});
