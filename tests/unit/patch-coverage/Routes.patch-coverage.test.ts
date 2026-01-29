import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock environment and external dependencies used by route modules
vi.mock('@config/env', () => {
  const getBool = vi.fn();
  const get = vi.fn();
  return {
    Env: Object.freeze({
      getBool,
      get,
      BASE_URL: '',
      HOST: '',
      PORT: 0,
      APP_NAME: 'TestApp',
    }),
  };
});

vi.mock('@/observability/PrometheusMetrics', () => ({
  PrometheusMetrics: {
    getMetricsText: vi.fn(async () => ({ contentType: 'text/plain', body: 'metrics' })),
  },
}));

vi.mock('@/openapi/OpenApiGenerator', () => ({
  OpenApiGenerator: { generate: vi.fn(() => ({ openapi: '3.0.0' })) },
}));

vi.mock('@node-singletons/fs', () => ({
  fsPromises: {
    stat: vi.fn(async () => ({ isDirectory: () => false })),
    access: vi.fn(async () => true),
    readFile: vi.fn(async () => Buffer.from('file')),
  },
  existsSync: vi.fn(() => true),
  statSync: vi.fn(() => ({ isDirectory: () => false })),
  readFileSync: vi.fn(() => Buffer.from('file')),
}));

vi.mock('@node-singletons/path', () => ({
  extname: vi.fn((p: string) => {
    const idx = p.lastIndexOf('.');
    return idx === -1 ? '' : p.slice(idx);
  }),
  join: vi.fn((...parts: string[]) => parts.join('/')),
  resolve: vi.fn((...parts: string[]) => parts.join('/')),
  sep: '/',
}));

vi.mock('@core-routes/publicRoot', () => ({
  getPublicRoot: vi.fn(() => '/public'),
  getPublicRootAsync: vi.fn(async () => '/public'),
  getFrameworkPublicRoots: vi.fn(() => []),
}));

import * as Doc from '@/routes/doc';
import { serveErrorPagesFile } from '@/routes/errorPages';
import { registerMetricsRoutes } from '@/routes/metrics';
import { registerOpenApiRoutes } from '@/routes/openapi';
import { Router } from '@/routes/Router';
import { RouteRegistry } from '@/routes/RouteRegistry';

describe('Routes patch coverage', () => {
  beforeEach(() => {
    // clear route registry between tests
    RouteRegistry.clear();
    vi.clearAllMocks();
  });

  it('registers metrics route and invokes handler', async () => {
    const { Env } = await import('@config/env');
    (Env.getBool as unknown as any).mockReturnValue(true);
    (Env.get as unknown as any).mockReturnValue('/metrics-custom');

    const router = Router.createRouter();
    registerMetricsRoutes(router);

    const getRoutes = Router.getRoutes(router);
    expect(getRoutes.some((r) => r.path.endsWith('/metrics-custom'))).toBe(true);

    const methodRoutes = router.routeIndex.get('GET') ?? [];
    const route = methodRoutes.find((r) => r.path.endsWith('/metrics-custom'))!;

    const res: any = { setHeader: vi.fn(), send: vi.fn() };
    await route.handler({} as any, res);
    expect(res.setHeader).toHaveBeenCalled();
    expect(res.send).toHaveBeenCalledWith('metrics');
  });

  it('serves documentation file and sets CSP headers', async () => {
    const res: any = { setStatus: vi.fn(), setHeader: vi.fn(), send: vi.fn() };
    // setDocumentationCSPHeaders
    Doc.setDocumentationCSPHeaders(res);
    expect(res.setHeader).toHaveBeenCalled();

    // serveDocumentationFileAsync should return true when file exists
    const ok = await Doc.serveDocumentationFileAsync('/doc/index.html', res);
    expect(ok).toBe(true);
    expect(res.setStatus).toHaveBeenCalledWith(200);
  });

  it('serves error-pages and root 404', async () => {
    const res404: any = { setStatus: vi.fn(), setHeader: vi.fn(), send: vi.fn() };
    expect(serveErrorPagesFile('/error-pages', res404)).toBe(true);
    expect(res404.setStatus).toHaveBeenCalledWith(404);

    const res: any = { setStatus: vi.fn(), setHeader: vi.fn(), send: vi.fn() };
    const ok = serveErrorPagesFile('/error-pages/some.html', res);
    expect(ok).toBe(true);
    expect(res.setStatus).toHaveBeenCalledWith(200);
  });

  it('openapi routes return json and docs html', async () => {
    // add a route to registry so OpenApiGenerator receives something
    RouteRegistry.record({ method: 'GET', path: '/x' });

    const router = Router.createRouter();
    registerOpenApiRoutes(router);

    const methodRoutes = router.routeIndex.get('GET') ?? [];
    const openapiRoute = methodRoutes.find((r) => r.path.endsWith('/openapi.json'))!;
    const docsRoute = methodRoutes.find((r) => r.path.endsWith('/docs'))!;

    const resJson: any = { json: vi.fn() };
    await openapiRoute.handler({} as any, resJson);
    expect(resJson.json).toHaveBeenCalled();

    const resHtml: any = { html: vi.fn() };
    await docsRoute.handler({} as any, resHtml);
    expect(resHtml.html).toHaveBeenCalled();
  });

  it('router resource and matching works', () => {
    const router = Router.createRouter();

    const controller = {
      index: vi.fn(async (_req: any, res: any) => res.send('i')),
      show: vi.fn(async (_req: any, res: any) => res.send('s')),
      store: vi.fn(async (_req: any, res: any) => res.send('c')),
      update: vi.fn(async (_req: any, res: any) => res.send('u')),
      destroy: vi.fn(async (_req: any, res: any) => res.send('d')),
    };

    Router.resource(router, '/users', controller as any);
    const match = Router.match(router, 'GET', '/users/123');
    expect(match).not.toBeNull();
    expect(match?.params?.['id']).toBe('123');
  });
});
