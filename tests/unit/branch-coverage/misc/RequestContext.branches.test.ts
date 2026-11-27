import { describe, expect, it } from 'vitest';

import { RequestContext } from '@http/RequestContext';

const makeReq = (headers: Record<string, unknown>, context?: Record<string, unknown>): any => ({
  getHeader: (name: string) => headers[name.toLowerCase()],
  getMethod: () => 'GET',
  getPath: () => '/docs',
  context,
});

const input = (overrides: Partial<Parameters<typeof RequestContext.create>[0]> = {}) =>
  ({ requestId: 'r1', startTime: Date.now(), method: 'GET', path: '/docs', ...overrides }) as any;

describe('RequestContext uncovered branches', () => {
  it('create falls back through every trace id source', () => {
    const req = makeReq({});
    const ctx = RequestContext.create(req);
    expect(ctx.traceId).toBe(ctx.requestId);
    expect(ctx.userAgent).toBeUndefined();
  });

  it('create parses traceparent and rejects malformed or all-zero ids', () => {
    const valid = makeReq({ traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01' });
    expect(RequestContext.create(valid).traceId).toBe('4bf92f3577b34da6a3ce929d0e0e4736');

    expect(RequestContext.create(makeReq({ traceparent: '   ' })).traceId).toBeDefined();
    expect(RequestContext.create(makeReq({ traceparent: '00-short' })).traceId).toBeDefined();
    expect(
      RequestContext.create(makeReq({ traceparent: `00-${'0'.repeat(32)}-span-01` })).traceId
    ).not.toBe('0'.repeat(32));
  });

  it('create uses x-trace-id, microservice trace context and numeric context values', () => {
    expect(RequestContext.create(makeReq({ 'x-trace-id': 'header-trace' })).traceId).toBe(
      'header-trace'
    );
    expect(
      RequestContext.create(makeReq({}, { trace: { traceId: 'micro-trace' } })).traceId
    ).toBe('micro-trace');
    expect(RequestContext.create(makeReq({}, { trace: 'invalid' })).traceId).toBeDefined();
    expect(RequestContext.create(makeReq({}, { trace: {} })).traceId).toBeDefined();
    expect(RequestContext.create(makeReq({}, { userId: 42, tenantId: 7 }))).toMatchObject({
      userId: '42',
      tenantId: '7',
    });
    expect(RequestContext.create(makeReq({}, { userId: {}, tenantId: [] }))).toMatchObject({
      userId: undefined,
      tenantId: undefined,
    });
  });

  it('attach and get handle missing context and non-object values', () => {
    const req = makeReq({}, undefined);
    expect(RequestContext.get(req)).toBeUndefined();
    const ctx = input({ traceId: 't', userId: 'u', tenantId: 'x' });
    RequestContext.attach(req, ctx);
    expect(RequestContext.get(req)).toBe(ctx);

    const invalid = makeReq({}, { requestContext: 'not-an-object' });
    expect(RequestContext.get(invalid)).toBeUndefined();
    const nullContext = makeReq({}, { requestContext: null });
    expect(RequestContext.get(nullContext)).toBeUndefined();
  });

  it('attach skips undefined optional fields', () => {
    const req = makeReq({}, {});
    RequestContext.attach(req, input({ traceId: undefined, userId: undefined, tenantId: undefined }));
    expect(req.context.traceId).toBeUndefined();
    expect(req.context.userId).toBeUndefined();
    expect(req.context.tenantId).toBeUndefined();
  });

  it('setters ignore blank values and write to both request and request context', async () => {
    const req = makeReq({}, {});
    const ctx = input();
    RequestContext.attach(req, ctx);
    await RequestContext.run(ctx, () => {
      RequestContext.setUserId(req, '  ');
      RequestContext.setTenantId(req, undefined);
      RequestContext.setTraceId(req, 'valid-trace');
      expect(RequestContext.peek()).toBe(ctx);
    });
    expect(req.context.traceId).toBe('valid-trace');
    expect(ctx.traceId).toBe('valid-trace');
    expect(req.context.userId).toBeUndefined();
  });

  it('setters restore fallback storage after sync and async callbacks', async () => {
    const outer = input({ requestId: 'outer' });
    await RequestContext.run(outer, async () => {
      expect(await RequestContext.current()).toBe(outer);
      const inner = input({ requestId: 'inner' });
      await RequestContext.run(inner, () => {
        expect(RequestContext.peek()).toBe(inner);
      });
      expect(RequestContext.peek()).toBe(outer);
    });
    expect(RequestContext.peek()).toBeUndefined();
  });

  it('enrich adds status and duration', () => {
    const enriched = RequestContext.enrich(input({ startTime: Date.now() - 10 }), 201);
    expect(enriched.status).toBe(201);
    expect(enriched.duration).toBeGreaterThanOrEqual(10);
  });
});
