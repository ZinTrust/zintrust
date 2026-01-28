import { describe, expect, it, vi } from 'vitest';

describe('routes/openapi patch coverage', () => {
  it('computes serverUrl from BASE_URL and serves json/html routes', async () => {
    vi.resetModules();

    const generate = vi.fn(() => ({ ok: true }));
    const routerGet = vi.fn();

    vi.doMock('@/openapi/OpenApiGenerator', () => ({
      OpenApiGenerator: {
        generate,
      },
    }));

    vi.doMock('@routing/RouteRegistry', () => ({
      RouteRegistry: {
        list: () => [{ method: 'GET', path: '/x' }],
      },
    }));

    vi.doMock('@routing/Router', () => ({
      Router: {
        get: routerGet,
      },
    }));

    vi.doMock('@config/env', () => ({
      Env: {
        BASE_URL: 'https://example.test',
        HOST: 'localhost',
        PORT: 3000,
        APP_NAME: 'ZinTrust',
        get: (_key: string, def: string) => def,
        getInt: (_key: string, def?: number) => def ?? 0,
        getBool: (_key: string, def?: boolean) => def ?? false,
        getFloat: (_key: string, def?: number) => def ?? 0,
      },
    }));

    const { registerOpenApiRoutes } = await import('@routes/openapi');

    registerOpenApiRoutes({} as any);

    expect(routerGet).toHaveBeenCalledTimes(2);

    const openapiHandler = routerGet.mock.calls[0]?.[2];
    const docsHandler = routerGet.mock.calls[1]?.[2];

    const resJson = { json: vi.fn(), html: vi.fn() } as any;

    await openapiHandler({}, resJson);

    expect(generate).toHaveBeenCalledWith(
      [{ method: 'GET', path: '/x' }],
      expect.objectContaining({
        title: 'ZinTrust',
        serverUrl: 'https://example.test',
        excludePaths: ['/openapi.json', '/docs'],
      })
    );
    expect(resJson.json).toHaveBeenCalledWith({ ok: true });

    await docsHandler({}, resJson);
    expect(resJson.html).toHaveBeenCalled();
  });

  it('computes serverUrl from HOST/PORT when BASE_URL is empty', async () => {
    vi.resetModules();

    const generate = vi.fn(() => ({ ok: true }));
    const routerGet = vi.fn();

    vi.doMock('@/openapi/OpenApiGenerator', () => ({
      OpenApiGenerator: { generate },
    }));

    vi.doMock('@routing/RouteRegistry', () => ({
      RouteRegistry: {
        list: () => [],
      },
    }));

    vi.doMock('@routing/Router', () => ({
      Router: {
        get: routerGet,
      },
    }));

    vi.doMock('@config/env', () => ({
      Env: {
        BASE_URL: '',
        HOST: '127.0.0.1',
        PORT: 3005,
        APP_NAME: 'ZinTrust',
        get: (_key: string, def: string) => def,
        getInt: (_key: string, def?: number) => def ?? 0,
        getBool: (_key: string, def?: boolean) => def ?? false,
        getFloat: (_key: string, def?: number) => def ?? 0,
      },
    }));

    const { registerOpenApiRoutes } = await import('@routes/openapi');

    registerOpenApiRoutes({} as any);

    const openapiHandler = routerGet.mock.calls[0]?.[2];
    const resJson = { json: vi.fn() } as any;

    await openapiHandler({}, resJson);

    expect(generate).toHaveBeenCalledWith(
      [],
      expect.objectContaining({
        serverUrl: 'http://127.0.0.1:3005',
      })
    );
  });

  it('omits serverUrl when HOST/PORT are invalid', async () => {
    vi.resetModules();

    const generate = vi.fn(() => ({ ok: true }));
    const routerGet = vi.fn();

    vi.doMock('@/openapi/OpenApiGenerator', () => ({
      OpenApiGenerator: { generate },
    }));

    vi.doMock('@routing/RouteRegistry', () => ({
      RouteRegistry: {
        list: () => [],
      },
    }));

    vi.doMock('@routing/Router', () => ({
      Router: {
        get: routerGet,
      },
    }));

    vi.doMock('@config/env', () => ({
      Env: {
        BASE_URL: '',
        HOST: '',
        PORT: Number.NaN,
        APP_NAME: 'ZinTrust',
        get: (_key: string, def: string) => def,
        getInt: (_key: string, def?: number) => def ?? 0,
        getBool: (_key: string, def?: boolean) => def ?? false,
        getFloat: (_key: string, def?: number) => def ?? 0,
      },
    }));

    const { registerOpenApiRoutes } = await import('@routes/openapi');

    registerOpenApiRoutes({} as any);

    const openapiHandler = routerGet.mock.calls[0]?.[2];
    const resJson = { json: vi.fn() } as any;

    await openapiHandler({}, resJson);

    expect(generate).toHaveBeenCalledWith(
      [],
      expect.objectContaining({
        serverUrl: undefined,
      })
    );
  });
});
