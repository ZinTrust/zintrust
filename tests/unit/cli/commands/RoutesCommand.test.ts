import { Router } from '@core-routes/Router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const metricsHandler = () => undefined;
const rootHandler = () => undefined;
const createUserHandler = () => undefined;
const getUserHandler = () => undefined;

const registerCoreRoutesImpl = (router: any) => {
  Router.get(router, '/metrics', metricsHandler, { middleware: ['auth', 'validateFoo'] });
  Router.get(router, '/', rootHandler, undefined);
};

const registerRoutesImpl = (router: any) => {
  Router.post(router, '/api/v1/users', createUserHandler, { middleware: ['jwt'] });
  Router.get(router, '/api/v1/users/:id', getUserHandler, {
    middleware: ['validateUser'],
  });
};

const createAnonymousHandler = () => () => undefined;
const registerAnonRouteImpl = (router: any) => {
  Router.get(router, '/anon', createAnonymousHandler(), undefined);
};

const mocked = vi.hoisted(() => ({
  envGet: vi.fn(),
  envGetInt: vi.fn(),
  registerCoreRoutes: vi.fn(),
  registerRoutes: vi.fn(),
  tryLoadNodeRuntime: vi.fn(),
  getServiceManifest: vi.fn(),
  resolveNodeProjectRoot: vi.fn(async () => '/project'),
  useFileLoader: vi.fn(),
}));

const createLoader = (args?: {
  path?: string;
  exists?: boolean;
  module?: Record<string, unknown>;
  error?: Error;
}) => ({
  candidates: () => [args?.path ?? '/project/routes/api.ts'],
  path: () => args?.path ?? '/project/routes/api.ts',
  exists: () => args?.exists === true,
  get: async () => {
    if (args?.error !== undefined) throw args.error;
    return args?.module ?? {};
  },
  getModule: async () => {
    if (args?.error !== undefined) throw args.error;
    return args?.module ?? {};
  },
});

vi.mock('@config/env', () => ({
  Env: {
    get: (...args: any[]) => mocked.envGet(...args),
    getInt: (...args: any[]) => mocked.envGetInt(...args),
    getBool: (_key: string, fallback?: boolean) => fallback ?? false,
    BASE_URL: '',
    PORT: 0,
  },
}));

vi.mock('@core-routes/CoreRoutes', () => ({
  registerCoreRoutes: (...args: any[]) => mocked.registerCoreRoutes(...args),
}));

// Default: application routes exist
vi.mock('@routes/api', () => ({
  registerRoutes: (...args: any[]) => mocked.registerRoutes(...args),
}));

vi.mock('@runtime/ProjectRuntime', () => ({
  ProjectRuntime: {
    tryLoadNodeRuntime: (...args: any[]) => mocked.tryLoadNodeRuntime(...args),
    getServiceManifest: (...args: any[]) => mocked.getServiceManifest(...args),
  },
}));

vi.mock('@runtime/resolveNodeProjectRoot', () => ({
  resolveNodeProjectRoot: (...args: any[]) => mocked.resolveNodeProjectRoot(...args),
}));

vi.mock('@runtime/useFileLoader', () => ({
  useFileLoader: (...args: any[]) => mocked.useFileLoader(...args),
}));

describe('RoutesCommand', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    mocked.envGet.mockImplementation((_key: string, defaultVal?: string) => defaultVal ?? '');
    mocked.envGetInt.mockImplementation((_key: string, defaultVal?: number) => defaultVal ?? 0);

    mocked.registerCoreRoutes.mockImplementation(registerCoreRoutesImpl);
    mocked.registerRoutes.mockImplementation(registerRoutesImpl);
    mocked.tryLoadNodeRuntime.mockResolvedValue(undefined);
    mocked.getServiceManifest.mockReturnValue([]);
    mocked.useFileLoader.mockImplementation(() => createLoader());
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it('prints JSON when --json is used and applies method+filter', async () => {
    mocked.envGet.mockImplementation((key: string, defaultVal?: string) => {
      if (key === 'BASE_URL') return 'example.com';
      return defaultVal ?? '';
    });
    mocked.envGetInt.mockImplementation((key: string, defaultVal?: number) => {
      if (key === 'PORT') return 3000;
      return defaultVal ?? 0;
    });

    const { RoutesCommand } = await import('@cli/commands/RoutesCommand');
    const cmd = RoutesCommand.create();

    await cmd.execute({ json: true, method: 'GET', filter: 'users', groupBy: 'service' });

    const printed = logSpy.mock.calls.map((c) => String(c[0] ?? '')).join('\n');
    expect(printed).toContain('"count"');
    expect(printed).toContain('/api/v1/users');
    expect(printed).not.toContain('POST');
  });

  it('renders a table when json=false and supports group-by none', async () => {
    const { RoutesCommand } = await import('@cli/commands/RoutesCommand');
    const cmd = RoutesCommand.create();

    await cmd.execute({ json: false, groupBy: 'none' });

    const printed = logSpy.mock.calls.map((c) => String(c[0] ?? '')).join('\n');
    expect(printed).toContain('┌');
    expect(printed).toContain('URL');
    expect(printed).toContain('/metrics');
  });

  it('reports invalid group-by via thrown CLI error', async () => {
    const { RoutesCommand } = await import('@cli/commands/RoutesCommand');
    const cmd = RoutesCommand.create();

    await expect(cmd.execute({ groupBy: 'wat' })).rejects.toThrow(/Invalid --group-by/i);
  });

  it('continues when application routes are missing', async () => {
    mocked.registerRoutes.mockImplementation(() => {
      throw new Error('missing');
    });

    const { RoutesCommand } = await import('@cli/commands/RoutesCommand');
    const cmd = RoutesCommand.create();

    await cmd.execute({ json: true });

    const printed = logSpy.mock.calls.map((c) => String(c[0] ?? '')).join('\n');
    expect(printed).toContain('/metrics');
  });

  it('handles invalid BASE_URL by falling back to best-effort join', async () => {
    mocked.envGet.mockImplementation((key: string, defaultVal?: string) => {
      if (key === 'BASE_URL') return 'bad host';
      return defaultVal ?? '';
    });
    mocked.envGetInt.mockImplementation((key: string, defaultVal?: number) => {
      if (key === 'PORT') return 1234;
      return defaultVal ?? 0;
    });

    const { RoutesCommand } = await import('@cli/commands/RoutesCommand');
    const cmd = RoutesCommand.create();

    await cmd.execute({ json: true, filter: '/metrics' });
    const printed = logSpy.mock.calls.map((c) => String(c[0] ?? '')).join('\n');
    expect(printed).toContain(':1234');
  });

  it('parses empty method list as no method filter', async () => {
    const { RoutesCommand } = await import('@cli/commands/RoutesCommand');
    const cmd = RoutesCommand.create();
    await cmd.execute({ json: true, method: '   ' });
    const printed = logSpy.mock.calls.map((c) => String(c[0] ?? '')).join('\n');
    expect(printed).toContain('/metrics');
    expect(printed).toContain('/api/v1/users');
  });

  it('normalizes anonymous handler names', async () => {
    mocked.registerCoreRoutes.mockImplementation(registerAnonRouteImpl);

    const { RoutesCommand } = await import('@cli/commands/RoutesCommand');
    const cmd = RoutesCommand.create();
    await cmd.execute({ json: true, filter: '/anon' });
    const printed = logSpy.mock.calls.map((c) => String(c[0] ?? '')).join('\n');
    expect(printed).toContain('<anonymous>');
  });

  it('includes manifest-backed routes when runtime services are loaded', async () => {
    mocked.getServiceManifest.mockReturnValue([
      {
        id: 'app/gatewaynext',
        domain: 'app',
        name: 'gatewaynext',
        monolithEnabled: true,
        loadRoutes: async () => ({
          registerRoutes(router: any) {
            Router.get(router, '/', () => undefined, undefined);
          },
        }),
      },
    ]);

    const { RoutesCommand } = await import('@cli/commands/RoutesCommand');
    const cmd = RoutesCommand.create();

    await cmd.execute({ json: true, filter: 'gatewaynext', groupBy: 'service' });

    const printed = logSpy.mock.calls.map((c) => String(c[0] ?? '')).join('\n');
    expect(printed).toContain('app/gatewaynext');
    expect(printed).toContain('/app/gatewaynext');
  });

  it('uses custom manifest prefixes for monolith route output', async () => {
    mocked.getServiceManifest.mockReturnValue([
      {
        id: 'app/gatewaynext',
        domain: 'app',
        name: 'gatewaynext',
        prefix: '/gateway',
        monolithEnabled: true,
        loadRoutes: async () => ({
          registerRoutes(router: any) {
            Router.get(router, '/', () => undefined, undefined);
          },
        }),
      },
    ]);

    const { RoutesCommand } = await import('@cli/commands/RoutesCommand');
    const cmd = RoutesCommand.create();

    await cmd.execute({ json: true, filter: '/gateway', groupBy: 'service' });

    const printed = logSpy.mock.calls.map((c) => String(c[0] ?? '')).join('\n');
    expect(printed).toContain('/gateway');
  });

  it('loads project routes from the active workspace file before falling back to core aliases', async () => {
    mocked.useFileLoader.mockImplementation(() =>
      createLoader({
        exists: true,
        module: {
          registerRoutes(router: any) {
            Router.get(router, '/workspace-only', () => undefined, undefined);
          },
        },
      })
    );

    const { RoutesCommand } = await import('@cli/commands/RoutesCommand');
    const cmd = RoutesCommand.create();

    await cmd.execute({ json: true });

    const printed = logSpy.mock.calls.map((c) => String(c[0] ?? '')).join('\n');
    expect(printed).toContain('/workspace-only');
    expect(printed).not.toContain('/api/v1/users');
    expect(mocked.resolveNodeProjectRoot).toHaveBeenCalled();
  });
});
