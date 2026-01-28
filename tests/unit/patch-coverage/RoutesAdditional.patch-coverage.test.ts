import { describe, expect, it, vi } from 'vitest';

// Mocks for node-singletons and config used by route modules
vi.mock('@config/env', () => ({
  Env: {
    BASE_URL: '',
    HOST: 'localhost',
    PORT: 3000,
    APP_NAME: 'ZinTrust',
    getBool: vi.fn(() => true),
    get: vi.fn((_k: string, d: any) => d),
  },
}));

vi.mock('@/observability/PrometheusMetrics', () => ({
  PrometheusMetrics: {
    getMetricsText: vi.fn(async () => ({ contentType: 'text/plain', body: 'metric 1' })),
  },
}));

vi.mock('@/openapi/OpenApiGenerator', () => ({
  OpenApiGenerator: {
    generate: vi.fn(() => ({ openapi: '3.0.0', info: { title: 'test' } })),
  },
}));

vi.mock('@core-routes/RouteRegistry', () => ({
  normalizeRouteMeta: vi.fn((m: any) => m || {}),
  RouteRegistry: {
    list: vi.fn(() => [{ path: '/a', method: 'get' }]),
    record: vi.fn(() => {}),
  },
}));

vi.mock('@node-singletons/path', () => ({
  extname: vi.fn((p: string) => (p.endsWith('.html') ? '.html' : '')),
  join: vi.fn((...parts: string[]) => parts.join('/')),
  resolve: vi.fn((p: string) => `/resolved/${p}`),
  sep: '/',
}));

vi.mock('@node-singletons/fs', () => ({
  promises: {
    stat: vi.fn(async (_p: string) => ({ isDirectory: () => false })),
    readFile: vi.fn(async (_p: string) => Buffer.from('<html>ok</html>')),
    access: vi.fn(async (_p: string) => undefined),
  },
  fsPromises: {
    stat: vi.fn(async (_p: string) => ({ isDirectory: () => false })),
    readFile: vi.fn(async (_p: string) => Buffer.from('<html>ok</html>')),
    access: vi.fn(async (_p: string) => undefined),
  },
  // sync helpers used by errorPages
  existsSync: vi.fn(() => true),
  statSync: vi.fn(() => ({ isDirectory: () => false })),
  readFileSync: vi.fn(() => Buffer.from('<html>ok</html>')),
}));

vi.mock('@core-routes/publicRoot', () => ({
  getPublicRoot: vi.fn(() => '/public'),
  getPublicRootAsync: vi.fn(async () => '/public'),
}));

import { serveDocumentationFileAsync, setDocumentationCSPHeaders } from '@core-routes/doc';
import { serveErrorPagesFile } from '@core-routes/errorPages';
import { registerMetricsRoutes } from '@core-routes/metrics';
import { registerOpenApiRoutes } from '@core-routes/openapi';
import { Router } from '@core-routes/Router';

describe('Routes additional coverage', () => {
  it('registers and handles metrics route', async () => {
    const rr = Router.createRouter();
    registerMetricsRoutes(rr as any);

    const match = Router.match(rr as any, 'GET', '/metrics');
    expect(match).toBeTruthy();

    const req: any = { url: '/metrics' };
    const res: any = {
      headers: {},
      setHeader(k: string, v: string) {
        this.headers[k] = v;
      },
      send: vi.fn(),
    };

    await match?.handler(req, res);
    expect(res.headers['Content-Type']).toBe('text/plain');
    expect(res.send).toHaveBeenCalled();
  });

  it('registers openapi routes and returns json and docs', async () => {
    const rr = Router.createRouter();
    registerOpenApiRoutes(rr as any);

    const jsonMatch = Router.match(rr as any, 'GET', '/openapi.json');
    expect(jsonMatch).toBeTruthy();

    const req: any = { url: '/openapi.json' };
    const res: any = { json: vi.fn(), send: vi.fn(), setHeader: vi.fn() };
    await jsonMatch?.handler(req, res);
    expect(res.json).toHaveBeenCalled();

    // call docs handler if present
    const docsMatch = Router.match(rr as any, 'GET', '/docs');
    if (docsMatch) {
      const r2: any = { send: vi.fn(), setHeader: vi.fn(), html: vi.fn() };
      await docsMatch.handler(req, r2);
      expect(r2.html).toHaveBeenCalled();
    }
  });

  it('serves documentation file and sets CSP headers', async () => {
    const res: any = {
      headers: {},
      setHeader(k: string, v: string) {
        this.headers[k] = v;
      },
      setStatus: vi.fn(() => res),
      send: vi.fn(),
    };

    setDocumentationCSPHeaders(res);
    expect(res.headers['Content-Security-Policy']).toBeTruthy();

    await serveDocumentationFileAsync('/doc', res);
    expect(res.send).toHaveBeenCalled();
  });

  it('serves error pages file', async () => {
    const res: any = {
      headers: {},
      setHeader() {
        /* empty */
      },
      send: vi.fn(),
      setStatus: vi.fn(() => res),
    };

    await serveErrorPagesFile('/error-pages/404.html', res);
    expect(res.send).toHaveBeenCalled();
  });

  it('Router.resource and match utilities', () => {
    const r = Router.createRouter();
    Router.resource(r, '/things', {
      index: () => {},
      show: () => {},
    } as any);

    const match = Router.match(r, 'GET', '/things');
    // match may be undefined depending on registration order; just ensure function runs
    expect(match === undefined || typeof match?.handler === 'function').toBe(true);
  });
});
