import { describe, expect, it } from 'vitest';
import { RequestContext } from '@/http/RequestContext';

const makeReq = (headers: Record<string, string | undefined> = {}) => ({
  context: {},
  getHeader: (name: string) => headers[name],
  getMethod: () => 'GET',
  getPath: () => '/test',
} as any);

describe('RequestContext', () => {
  it('create() captures headers and sets requestId when provided', () => {
    const req = makeReq({ 'x-request-id': 'hdr-1', 'user-agent': 'agent' });
    const ctx = RequestContext.create(req);

    expect(ctx.requestId).toBe('hdr-1');
    expect(ctx.userAgent).toBe('agent');
    expect(req.context['requestId']).toBe('hdr-1');
    expect(req.context['requestContext']).toBeDefined();
  });

  it('attach and get work as expected', () => {
    const req = makeReq();
    const ctx = { requestId: 'a', startTime: Date.now(), method: 'GET', path: '/a' } as any;
    RequestContext.attach(req, ctx);
    const got = RequestContext.get(req);
    expect(got).toBe(ctx);
    expect(req.context['requestId']).toBe('a');
  });

  it('enrich adds duration and status', () => {
    const start = Date.now() - 50;
    const ctx = { requestId: 'b', startTime: start, method: 'GET', path: '/b' } as any;
    const res = RequestContext.enrich(ctx, 200);
    expect(res.status).toBe(200);
    expect(typeof res.duration).toBe('number');
    expect(res.duration).toBeGreaterThanOrEqual(50);
  });

  it('run/current provide async storage behavior', async () => {
    const ctx = { requestId: 'run-1', startTime: Date.now(), method: 'GET', path: '/' } as any;
    const result = await RequestContext.run(ctx, async () => {
      const cur = await RequestContext.current();
      expect(cur).toEqual(ctx);
      return 'ok';
    });

    expect(result).toBe('ok');
  });
});
