/* eslint-disable no-await-in-loop -- deterministic sequential assertions in table-driven tests */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  envGet: vi.fn(),
  envGetInt: vi.fn(),
  registerCoreRoutes: vi.fn(),
  fallbackRegisterRoutes: vi.fn(),
  tryLoadNodeRuntime: vi.fn(),
  getServiceManifest: vi.fn(),
  resolveNodeProjectRoot: vi.fn(),
  useFileLoader: vi.fn(),
  getServicePrefix: vi.fn(),
  routes: [] as Array<Record<string, unknown>>,
  loaderExists: false,
  loaderModule: {} as unknown,
  loaderThrows: false,
  fallbackThrows: false,
  fallbackExport: {} as unknown,
  baseUrlUndefined: false,
  portUndefined: false,
}));

const createFakeRouter = (): Record<string, unknown> => ({ routes: [] });

const registerFakeRoute = (
  router: Record<string, unknown>,
  method: string,
  path: unknown,
  handler: unknown,
  options?: { middleware?: unknown }
): void => {
  (router['routes'] as Array<Record<string, unknown>>).push({
    method,
    path,
    handler,
    middleware: options?.middleware,
  });
};

vi.mock('@config/env', () => ({
  Env: {
    get: (...args: unknown[]) => mocks.envGet(...args),
    getInt: (...args: unknown[]) => mocks.envGetInt(...args),
    getBool: () => false,
    get BASE_URL() {
      return mocks.baseUrlUndefined ? undefined : '';
    },
    get PORT() {
      return mocks.portUndefined ? undefined : 4000;
    },
  },
}));

vi.mock('@core-routes/Router', () => ({
  Router: {
    createRouter: () => createFakeRouter(),
    getRoutes: (router: Record<string, unknown>) => router['routes'],
    get: (
      router: Record<string, unknown>,
      path: unknown,
      handler: unknown,
      options?: { middleware?: unknown }
    ) => registerFakeRoute(router, 'GET', path, handler, options),
    post: (
      router: Record<string, unknown>,
      path: unknown,
      handler: unknown,
      options?: { middleware?: unknown }
    ) => registerFakeRoute(router, 'POST', path, handler, options),
    group: (
      router: Record<string, unknown>,
      _prefix: string,
      callback: (router: Record<string, unknown>) => void
    ) => {
      callback({ ...router, routes: [] });
    },
  },
}));

vi.mock('@core-routes/CoreRoutes', () => ({
  registerCoreRoutes: (...args: unknown[]) => mocks.registerCoreRoutes(...args),
}));

vi.mock('@routes/api', () => mocks.fallbackExport);

vi.mock('@runtime/ProjectRuntime', () => ({
  ProjectRuntime: {
    tryLoadNodeRuntime: (...args: unknown[]) => mocks.tryLoadNodeRuntime(...args),
    getServiceManifest: (...args: unknown[]) => mocks.getServiceManifest(...args),
  },
}));

vi.mock('@runtime/resolveNodeProjectRoot', () => ({
  resolveNodeProjectRoot: (...args: unknown[]) => mocks.resolveNodeProjectRoot(...args),
}));

vi.mock('@runtime/useFileLoader', () => ({
  useFileLoader: (...args: unknown[]) => mocks.useFileLoader(...args),
}));

vi.mock('@microservices/ServiceManifest', () => ({
  getServicePrefix: (...args: unknown[]) => mocks.getServicePrefix(...args),
}));

const createLoader = () => ({
  candidates: () => ['/project/routes/api.ts'],
  path: () => '/project/routes/api.ts',
  exists: () => mocks.loaderExists,
  get: async () => mocks.loaderModule,
  getModule: async () => {
    if (mocks.loaderThrows) throw new Error('workspace module failed');
    return mocks.loaderModule;
  },
});

const printedJson = (logSpy: ReturnType<typeof vi.spyOn>): Record<string, unknown> => {
  const text = logSpy.mock.calls.map((call: any) => String(call[0] ?? '')).join('\n');
  return JSON.parse(text) as Record<string, unknown>;
};

describe('RoutesCommand uncovered branch coverage', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  const originalProjectRoot = process.env['ZINTRUST_PROJECT_ROOT'];

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    mocks.envGet.mockImplementation((key: string, fallback?: string) => {
      if (key === 'BASE_URL') return '';
      return fallback ?? '';
    });
    mocks.envGetInt.mockImplementation((_key: string, fallback?: number) => fallback ?? 0);
    mocks.registerCoreRoutes.mockImplementation((router: Record<string, unknown>) => {
      registerFakeRoute(router, 'GET', '/metrics', () => undefined, undefined);
    });
    mocks.fallbackRegisterRoutes.mockImplementation(() => undefined);
    mocks.tryLoadNodeRuntime.mockResolvedValue(undefined);
    mocks.getServiceManifest.mockReturnValue([]);
    mocks.resolveNodeProjectRoot.mockResolvedValue('/project');
    mocks.useFileLoader.mockImplementation(() => createLoader());
    mocks.getServicePrefix.mockReturnValue('/service');
    mocks.routes = [];
    mocks.loaderExists = false;
    mocks.loaderModule = {};
    mocks.loaderThrows = false;
    mocks.fallbackThrows = false;
    mocks.baseUrlUndefined = false;
    mocks.portUndefined = false;
    mocks.fallbackExport = {
      registerRoutes: (...args: unknown[]) => {
        if (mocks.fallbackThrows) throw new Error('fallback import failed');
        return mocks.fallbackRegisterRoutes(...args);
      },
    };
    delete process.env['ZINTRUST_PROJECT_ROOT'];
  });

  afterEach(() => {
    logSpy.mockRestore();
    if (originalProjectRoot === undefined) delete process.env['ZINTRUST_PROJECT_ROOT'];
    else process.env['ZINTRUST_PROJECT_ROOT'] = originalProjectRoot;
  });

  const execute = async (options: Record<string, unknown>): Promise<void> => {
    logSpy.mockClear();
    const { RoutesCommand } = await import('@cli/commands/RoutesCommand');
    await RoutesCommand.create().execute(options);
  };

  it('normalizes unusual handler names, paths, methods, and middleware', async () => {
    const plain = () => undefined;
    mocks.registerCoreRoutes.mockImplementation((router: Record<string, unknown>) => {
      registerFakeRoute(router, 'get', undefined, null, undefined);
      registerFakeRoute(router, undefined, '/api/v1/users', plain.bind(null), {
        middleware: ['validateUser', 'jwt', 42, 'validateToken'],
      });
      registerFakeRoute(router, 'POST', '///', plain, { middleware: 'not-an-array' });
      registerFakeRoute(router, 'DELETE', '', plain, undefined);
      registerFakeRoute(router, 'PATCH', '/double//slash', plain, undefined);
    });

    for (const groupBy of ['group', 'service', 'none']) {
      await execute({ json: true, groupBy });
      const output = printedJson(logSpy);
      expect(output['count']).toBe(5);
    }

    const output = printedJson(logSpy)['routes'] as Array<Record<string, string>>;
    const byMethod = (method: string): Record<string, string> =>
      output.find((row) => row['method'] === method) ?? {};

    expect(byMethod('GET')).toMatchObject({
      path: '',
      handler: '<anonymous>',
    });
    expect(byMethod('')).toMatchObject({
      path: '/api/v1/users',
      handler: 'plain',
      validations: 'validateUser, validateToken',
      middleware: 'jwt',
    });
    // The last execution used --group-by none, and with no base origin URLs keep the raw path.
    expect(byMethod('POST')).toMatchObject({ path: '///', url: '///', group: '' });
    expect(byMethod('DELETE')).toMatchObject({ path: '', group: '' });
    expect(byMethod('PATCH')).toMatchObject({ path: '/double//slash', group: '' });
  });

  it('resolves base origins from urls, path-only values, and invalid hosts', async () => {
    const originFor = async (baseUrl: string, port: number): Promise<string> => {
      mocks.envGet.mockImplementation((key: string, fallback?: string) =>
        key === 'BASE_URL' ? baseUrl : fallback ?? ''
      );
      mocks.envGetInt.mockImplementation((key: string, fallback?: number) =>
        key === 'PORT' && port !== undefined ? port : fallback ?? 0
      );
      await execute({ json: true, filter: 'metrics' });
      const routes = (printedJson(logSpy)['routes'] ?? []) as Array<{ url: string }>;
      return routes[0]?.url ?? '';
    };

    expect(await originFor('', 0)).toBe('/metrics');
    expect(await originFor('/', 1234)).toBe('/metrics');
    expect(await originFor('example.com', 3000)).toBe('http://example.com:3000/metrics');
    expect(await originFor('https://example.com/', 3000)).toBe('https://example.com:3000/metrics');
    expect(await originFor('bad host', 1234)).toBe('bad host:1234/metrics');
    expect(await originFor('bad host:8080', 1234)).toBe('bad host:8080/metrics');
    expect(await originFor('bad host', 0)).toBe('bad host/metrics');

    mocks.baseUrlUndefined = true;
    mocks.portUndefined = true;
    expect(await originFor('', 0)).toBe('/metrics');
  });

  it('normalizes empty and slashless paths against a base origin', async () => {
    mocks.envGet.mockImplementation((key: string, fallback?: string) =>
      key === 'BASE_URL' ? 'example.com' : fallback ?? ''
    );
    mocks.registerCoreRoutes.mockImplementation((router: Record<string, unknown>) => {
      registerFakeRoute(router, 'GET', '', () => undefined, undefined);
      registerFakeRoute(router, 'GET', 'users', () => undefined, undefined);
    });

    await execute({ json: true });
    const urls = ((printedJson(logSpy)['routes'] ?? []) as Array<{ url: string }>).map(
      (route) => route.url
    );
    expect(urls).toEqual(['http://example.com:4000/', 'http://example.com:4000/users']);
  });

  it('filters rows by method and text and renders a table for non-json output', async () => {
    mocks.registerCoreRoutes.mockImplementation((router: Record<string, unknown>) => {
      registerFakeRoute(router, 'GET', '/users', () => undefined, {
        middleware: ['validateUser', 'jwt'],
      });
      registerFakeRoute(router, 'POST', '/users', () => undefined, undefined);
    });

    await execute({ json: true, method: 'GET, POST', filter: 'validateUser' });
    const rows = (printedJson(logSpy)['routes'] ?? []) as Array<Record<string, string>>;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.['method']).toBe('GET');

    await execute({ json: true, method: 'DELETE' });
    expect(printedJson(logSpy)['count']).toBe(0);

    await execute({ json: false, groupBy: 'group' });
    const text = logSpy.mock.calls.map((call: any) => String(call[0] ?? '')).join('\n');
    expect(text).toContain('┌');
    expect(text).toContain('/users');
  });

  it('ignores broken or unsupported manifest route providers', async () => {
    const functionRegister = vi.fn();
    mocks.getServiceManifest.mockReturnValue([
      { id: 'disabled', monolithEnabled: false, loadRoutes: vi.fn() },
      { id: 'no-loader', monolithEnabled: true },
      {
        id: 'broken',
        monolithEnabled: true,
        loadRoutes: async () => {
          throw new Error('broken service');
        },
      },
      {
        id: 'wrong-shape',
        monolithEnabled: true,
        loadRoutes: async () => ({ registerRoutes: 'not a function' }),
      },
      {
        id: 'working',
        monolithEnabled: true,
        loadRoutes: async () => ({ registerRoutes: functionRegister }),
      },
    ]);

    await execute({ json: true, groupBy: 'service' });

    expect(functionRegister).toHaveBeenCalledTimes(1);
    expect(process.env['ZINTRUST_PROJECT_ROOT']).toBe('/project');
  });

  it('falls back to the alias import for invalid or failing workspace loaders', async () => {
    const scenarios = [
      { exists: true, module: { registerRoutes: vi.fn() }, throws: false, fallbackThrows: false },
      {
        exists: true,
        module: { registerRoutes: 'not a function' },
        throws: false,
        fallbackThrows: false,
      },
      { exists: true, module: {}, throws: true, fallbackThrows: false },
      { exists: false, module: {}, throws: false, fallbackThrows: true },
      { exists: true, module: {}, throws: false, fallbackThrows: true },
      { exists: true, module: 'not-an-object', throws: false, fallbackThrows: true },
    ];

    for (const scenario of scenarios) {
      mocks.loaderExists = scenario.exists;
      mocks.loaderModule = scenario.module;
      mocks.loaderThrows = scenario.throws;
      mocks.fallbackThrows = scenario.fallbackThrows;
      mocks.fallbackRegisterRoutes.mockImplementation(() => undefined);

      await expect(execute({ json: true })).resolves.toBeUndefined();
    }

    expect(mocks.useFileLoader).toHaveBeenCalledWith('routes/api.ts');
  });

  it('returns no registrar when the alias export has no callable registerRoutes', async () => {
    const exported = mocks.fallbackExport as Record<string, unknown>;
    for (const value of [undefined, 'not-a-function', 42]) {
      exported['registerRoutes'] = value;
      await expect(execute({ json: true })).resolves.toBeUndefined();
    }
  });
});
