import { describe, expect, it } from 'vitest';

import { RouteRegistry, normalizeRouteMeta } from '@core-routes/RouteRegistry';

describe('RouteRegistry', () => {
  it('records, lists, and clears routes', () => {
    RouteRegistry.clear();

    RouteRegistry.record({ method: 'GET', path: '/a' });
    RouteRegistry.record({ method: 'POST', path: '/b', middleware: ['auth'] });

    expect(RouteRegistry.list()).toEqual([
      { method: 'GET', path: '/a' },
      { method: 'POST', path: '/b', middleware: ['auth'] },
    ]);

    RouteRegistry.clear();
    expect(RouteRegistry.list()).toEqual([]);
  });
});

describe('normalizeRouteMeta', () => {
  it('returns undefined when input is undefined', () => {
    expect(normalizeRouteMeta(undefined)).toBeUndefined();
  });

  it('returns normalized-shaped objects as-is', () => {
    const existing = {
      summary: 'S',
      request: { bodySchema: { type: 'object' } as any },
      response: { status: 200, schema: { ok: true } },
    };

    expect(normalizeRouteMeta(existing as any)).toBe(existing);
  });

  it('maps legacy requestSchema into request.bodySchema', () => {
    const schema = { type: 'object' } as any;
    const normalized = normalizeRouteMeta({ requestSchema: schema });
    expect(normalized).toEqual({ request: { bodySchema: schema }, response: undefined });
  });

  it('maps legacy responseSchema/status into response, omitting when neither provided', () => {
    expect(normalizeRouteMeta({ summary: 'x' })).toEqual({
      summary: 'x',
      description: undefined,
      tags: undefined,
      request: undefined,
      response: undefined,
    });

    expect(normalizeRouteMeta({ responseStatus: 201 })).toEqual({
      summary: undefined,
      description: undefined,
      tags: undefined,
      request: undefined,
      response: { status: 201, schema: undefined },
    });

    expect(normalizeRouteMeta({ responseSchema: { ok: true } })).toEqual({
      summary: undefined,
      description: undefined,
      tags: undefined,
      request: undefined,
      response: { status: undefined, schema: { ok: true } },
    });
  });
});
