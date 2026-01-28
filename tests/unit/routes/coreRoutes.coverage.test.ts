import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Router } from '@core-routes/Router';
import { RouteRegistry } from '@core-routes/RouteRegistry';

vi.mock('@config/env', () => ({
  Env: {
    get: vi.fn((_k: string, d?: string) => d ?? ''),
    getBool: vi.fn((_k: string, d?: boolean) => d ?? false),
    APP_NAME: 'ZinTrust Framework',
    HOST: 'localhost',
    PORT: 3000,
    BASE_URL: '',
    getInt: vi.fn((_k: string, d?: number) => d ?? 0),
  },
}));

vi.mock('@/openapi/OpenApiGenerator', () => ({
  OpenApiGenerator: {
    generate: vi.fn(),
  },
}));

vi.mock('@/observability/PrometheusMetrics', () => ({
  PrometheusMetrics: {
    getMetricsText: vi.fn(),
  },
}));

vi.mock('@node-singletons/fs', () => ({
  fsPromises: {
    stat: vi.fn(),
    access: vi.fn(),
    readFile: vi.fn(),
  },
  existsSync: vi.fn(),
  statSync: vi.fn(),
  readFileSync: vi.fn(),
}));

vi.mock('@node-singletons/path', () => ({
  join: (...parts: string[]) => parts.join('/'),
  extname: (p: string) => (p.includes('.') ? p.slice(p.lastIndexOf('.')) : ''),
}));

vi.mock('@core-routes/publicRoot', () => ({
  getPublicRootAsync: vi.fn().mockResolvedValue('/tmp/public'),
  getPublicRoot: vi.fn().mockReturnValue('/tmp/public'),
}));

describe('Core routes coverage helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    RouteRegistry.clear();
  });

  it('registers metrics route when enabled and responds with metrics text', async () => {
    const Env = (await import('@config/env')) as any;
    // enable metrics
    Env.Env.getBool.mockReturnValue(true);
    Env.Env.get.mockImplementation((_k: string, d?: string) => d ?? '');

    const Prom = (await import('@/observability/PrometheusMetrics')) as any;
    Prom.PrometheusMetrics.getMetricsText.mockResolvedValue({
      contentType: 'text/plain',
      body: 'm',
    });
    const router = Router.createRouter();

    const register = (await import('@core-routes/CoreRoutes')).registerCoreRoutes;
    register(router as any);

    const match = Router.match(router, 'GET', '/metrics');
    expect(match).toBeTruthy();
    if (match) {
      const res: any = {
        headers: {},
        body: null,
        setHeader(k: string, v: string) {
          this.headers[k] = v;
        },
        send(b: any) {
          this.body = b;
        },
      };

      await match.handler({} as any, res);
      expect(res.headers['Content-Type']).toBe('text/plain');
      expect(res.body).toBe('m');
    }
  });

  it('registerOpenApiRoutes exposes json and docs handlers', async () => {
    const router = Router.createRouter();

    const OpenApi = await import('@/openapi/OpenApiGenerator');
    vi.mocked(OpenApi.OpenApiGenerator.generate).mockReturnValue({ info: { title: 'x' } } as any);

    const register = (await import('@core-routes/openapi')).registerOpenApiRoutes;
    register(router as any);

    const matchJson = Router.match(router, 'GET', '/openapi.json');
    expect(matchJson).toBeTruthy();
    if (matchJson) {
      const res: any = {
        jsonCalled: null,
        json(payload: any) {
          this.jsonCalled = payload;
        },
      };
      await matchJson.handler({} as any, res);
      expect(res.jsonCalled).toBeTruthy();
    }

    const matchDocs = Router.match(router, 'GET', '/docs');
    expect(matchDocs).toBeTruthy();
    if (matchDocs) {
      const res: any = {
        htmlCalled: null,
        html(h: any) {
          this.htmlCalled = h;
        },
      };
      await matchDocs.handler({} as any, res);
      expect(typeof res.htmlCalled).toBe('string');
      expect(res.htmlCalled.includes('ZinTrust Framework')).toBe(true);
    }
  });

  it('doc utilities set CSP headers and serve documentation files (happy path)', async () => {
    const doc = await import('@core-routes/doc');

    const res: any = {
      headers: {},
      status: 0,
      setHeader(k: string, v: string) {
        this.headers[k] = v;
      },
      setStatus(s: number) {
        this.status = s;
      },
      send() {
        /* empty */
      },
    };
    doc.setDocumentationCSPHeaders(res);
    expect(
      res.headers['Content-Security-Policy'] || res.headers['content-security-policy']
    ).toBeTruthy();

    // Mock fs and public root to simulate a file existing
    const fs = await import('@node-singletons/fs');
    const publicRootModule = await import('@core-routes/publicRoot');

    vi.mocked(publicRootModule.getPublicRootAsync).mockResolvedValue('/tmp/public');
    vi.mocked(fs.fsPromises.stat).mockResolvedValue({ isDirectory: () => true } as any);
    vi.mocked(fs.fsPromises.access).mockResolvedValue(undefined as any);
    vi.mocked(fs.fsPromises.readFile).mockResolvedValue(Buffer.from('ok') as any);
    // path.join is already mocked above

    const served = await doc.serveDocumentationFileAsync('/doc', res);
    expect(served).toBe(true);
    expect(res.status === 200 || res.status === 0).toBe(true);
  });

  it('serveErrorPagesFile handles root and unknown paths', async () => {
    const ep = await import('@core-routes/errorPages');
    const res: any = {
      headers: {},
      status: 0,
      body: null,
      setHeader(k: string, v: string) {
        this.headers[k] = v;
      },
      setStatus(s: number) {
        this.status = s;
      },
      send(b?: any) {
        this.body = b;
      },
    };

    expect(ep.serveErrorPagesFile('/error-pages', res)).toBe(true);
    expect(res.status).toBe(404);

    // Non matching path returns false
    const res2: any = {
      setHeader() {
        /* empty */
      },
      setStatus() {
        /* empty */
      },
      send() {
        /* empty */
      },
    };
    expect(ep.serveErrorPagesFile('/not-error-pages', res2)).toBe(false);
  });

  it('Router.any registers handlers for all methods and resource helper works', () => {
    const router = Router.createRouter();
    const handler = vi.fn();
    Router.any(router as any, '/foo', handler as any);

    expect(Router.match(router, 'GET', '/foo')).toBeTruthy();
    expect(Router.match(router, 'POST', '/foo')).toBeTruthy();

    // resource helper registers based on controller methods
    const ctrl = {
      index: vi.fn(),
      store: vi.fn(),
      show: vi.fn(),
      update: vi.fn(),
      destroy: vi.fn(),
    };

    Router.resource(router as any, '/items', ctrl as any);
    expect(Router.match(router, 'GET', '/items')).toBeTruthy();
    expect(Router.match(router, 'POST', '/items')).toBeTruthy();
    expect(Router.match(router, 'GET', '/items/1')).toBeTruthy();
    expect(Router.match(router, 'PUT', '/items/1')).toBeTruthy();
    expect(Router.match(router, 'DELETE', '/items/1')).toBeTruthy();
  });
});
