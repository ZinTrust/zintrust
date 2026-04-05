import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('registerRoute helpers patch coverage', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    delete (globalThis as { __zintrustRoutes?: unknown }).__zintrustRoutes;
    vi.restoreAllMocks();
  });

  it('tryImportOptional returns module when importable', async () => {
    vi.doMock('@runtime/detectRuntime', () => ({ detectRuntime: () => ({ isCloudflare: false }) }));
    vi.doMock('@/config', () => ({ appConfig: { isDevelopment: () => true } }));

    const { tryImportOptional } = await import('@registry/registerRoute');
    const fsMod = await tryImportOptional<{ existsSync: unknown }>('@node-singletons/fs');
    expect(fsMod).toBeDefined();
  });

  it('isCompiledJsModule returns false in ts test environment', async () => {
    vi.doMock('@runtime/detectRuntime', () => ({ detectRuntime: () => ({ isCloudflare: false }) }));
    vi.doMock('@/config', () => ({ appConfig: { isDevelopment: () => true } }));

    const { isCompiledJsModule } = await import('@registry/registerRoute');
    expect(typeof isCompiledJsModule()).toBe('boolean');
  });

  it('registerMasterRoutes registers global routes in cloudflare runtime', async () => {
    const registerCoreRoutes = vi.fn();
    vi.doMock('@core-routes/CoreRoutes', () => ({ registerCoreRoutes }));
    vi.doMock('@runtime/detectRuntime', () => ({ detectRuntime: () => ({ isCloudflare: true }) }));
    vi.doMock('@/config', () => ({ appConfig: { isDevelopment: () => true } }));
    const tryLoadWorkerRuntime = vi.fn(async () => undefined);
    vi.doMock('@runtime/ProjectRuntime', () => ({
      ProjectRuntime: {
        tryLoadWorkerRuntime,
        tryLoadNodeRuntime: vi.fn(async () => undefined),
        getActiveService: () => undefined,
        getServiceManifest: () => [],
      },
    }));

    const registerRoutes = vi.fn();
    (
      globalThis as { __zintrustRoutes?: { registerRoutes: (r: unknown) => void } }
    ).__zintrustRoutes = {
      registerRoutes,
    };

    const router = { routes: [{ path: '/x' }] } as any;
    const { registerMasterRoutes } = await import('@registry/registerRoute');
    await registerMasterRoutes('', router);

    expect(tryLoadWorkerRuntime).toHaveBeenCalled();
    expect(registerRoutes).toHaveBeenCalledWith(router);
    expect(registerCoreRoutes).toHaveBeenCalledWith(router);
  });

  it('registerMasterRoutes mounts manifest routes under the service prefix in monolith mode', async () => {
    vi.doMock('@core-routes/CoreRoutes', () => ({ registerCoreRoutes: vi.fn() }));
    vi.doMock('@runtime/detectRuntime', () => ({ detectRuntime: () => ({ isCloudflare: false }) }));
    vi.doMock('@/config', () => ({ appConfig: { isDevelopment: () => true } }));
    const ensureLoaded = vi.fn();
    vi.doMock('@cli/utils/EnvFileLoader', () => ({
      EnvFileLoader: {
        ensureLoaded,
      },
    }));
    const tryLoadNodeRuntime = vi.fn(async () => undefined);
    vi.doMock('@runtime/ProjectRuntime', () => ({
      ProjectRuntime: {
        tryLoadNodeRuntime,
        getActiveService: () => undefined,
        getServiceManifest: () => [
          {
            id: 'app/gatewaynext',
            domain: 'app',
            name: 'gatewaynext',
            prefix: '/edge/gateway',
            monolithEnabled: true,
            loadRoutes: async () => {
              const { Router } = await import('@core-routes/Router');
              return {
                registerRoutes(router: unknown) {
                  Router.get(router as any, '/', () => undefined);
                },
              };
            },
          },
        ],
      },
    }));

    const { Router } = await import('@core-routes/Router');
    const { registerMasterRoutes } = await import('@registry/registerRoute');
    const router = Router.createRouter();

    await registerMasterRoutes('/missing', router);

    expect(tryLoadNodeRuntime).toHaveBeenCalled();
    expect(ensureLoaded).toHaveBeenCalledWith({
      cwd: process.cwd(),
      includeCwd: true,
      envPaths: [expect.stringContaining('/src/services/app/gatewaynext')],
      envPathsOverrideExisting: true,
    });
    expect(Router.match(router, 'GET', '/edge/gateway')).not.toBeNull();
    expect(Router.match(router, 'GET', '/')).toBeNull();
  });

  it('registerMasterRoutes keeps root env authoritative in monolith mode when RUN_AS_MONOLITH is enabled', async () => {
    process.env['RUN_AS_MONOLITH'] = 'true';

    vi.doMock('@core-routes/CoreRoutes', () => ({ registerCoreRoutes: vi.fn() }));
    vi.doMock('@runtime/detectRuntime', () => ({ detectRuntime: () => ({ isCloudflare: false }) }));
    vi.doMock('@/config', () => ({ appConfig: { isDevelopment: () => true } }));
    const ensureLoaded = vi.fn();
    vi.doMock('@cli/utils/EnvFileLoader', () => ({
      EnvFileLoader: {
        ensureLoaded,
      },
    }));
    vi.doMock('@runtime/ProjectRuntime', () => ({
      ProjectRuntime: {
        tryLoadNodeRuntime: vi.fn(async () => undefined),
        getActiveService: () => undefined,
        getServiceManifest: () => [
          {
            id: 'app/gatewaynext',
            domain: 'app',
            name: 'gatewaynext',
            prefix: '/edge/gateway',
            monolithEnabled: true,
            loadRoutes: async () => {
              const { Router } = await import('@core-routes/Router');
              return {
                registerRoutes(router: unknown) {
                  Router.get(router as any, '/', () => undefined);
                },
              };
            },
          },
        ],
      },
    }));

    const { Router } = await import('@core-routes/Router');
    const { registerMasterRoutes } = await import('@registry/registerRoute');
    const router = Router.createRouter();

    await registerMasterRoutes('/missing', router);

    expect(ensureLoaded).toHaveBeenCalledWith({
      cwd: process.cwd(),
      includeCwd: true,
      envPaths: [expect.stringContaining('/src/services/app/gatewaynext')],
      envPathsOverrideExisting: false,
    });
  });

  it('registerMasterRoutes mounts the active service directly in standalone node mode', async () => {
    vi.doMock('@core-routes/CoreRoutes', () => ({ registerCoreRoutes: vi.fn() }));
    vi.doMock('@runtime/detectRuntime', () => ({ detectRuntime: () => ({ isCloudflare: false }) }));
    vi.doMock('@/config', () => ({ appConfig: { isDevelopment: () => true } }));
    vi.doMock('@cli/utils/EnvFileLoader', () => ({
      EnvFileLoader: {
        ensureLoaded: vi.fn(),
      },
    }));
    vi.doMock('@runtime/ProjectRuntime', () => ({
      ProjectRuntime: {
        tryLoadNodeRuntime: vi.fn(async () => undefined),
        getActiveService: () => ({ id: 'app/gatewaynext', domain: 'app', name: 'gatewaynext' }),
        getServiceManifest: () => [
          {
            id: 'app/gatewaynext',
            domain: 'app',
            name: 'gatewaynext',
            prefix: '/edge/gateway',
            monolithEnabled: true,
            loadRoutes: async () => {
              const { Router } = await import('@core-routes/Router');
              return {
                registerRoutes(router: unknown) {
                  Router.get(router as any, '/', () => undefined);
                },
              };
            },
          },
        ],
      },
    }));

    const { Router } = await import('@core-routes/Router');
    const { registerMasterRoutes } = await import('@registry/registerRoute');
    const router = Router.createRouter();

    await registerMasterRoutes('/missing', router);

    expect(Router.match(router, 'GET', '/')).not.toBeNull();
    expect(Router.match(router, 'GET', '/edge/gateway')).toBeNull();
  });

  it('registerMasterRoutes skips service env loading when manifest loadEnv is false', async () => {
    vi.doMock('@core-routes/CoreRoutes', () => ({ registerCoreRoutes: vi.fn() }));
    vi.doMock('@runtime/detectRuntime', () => ({ detectRuntime: () => ({ isCloudflare: false }) }));
    vi.doMock('@/config', () => ({ appConfig: { isDevelopment: () => true } }));
    const ensureLoaded = vi.fn();
    vi.doMock('@cli/utils/EnvFileLoader', () => ({
      EnvFileLoader: {
        ensureLoaded,
      },
    }));
    vi.doMock('@runtime/ProjectRuntime', () => ({
      ProjectRuntime: {
        tryLoadNodeRuntime: vi.fn(async () => undefined),
        getActiveService: () => undefined,
        getServiceManifest: () => [
          {
            id: 'app/gatewaynext',
            domain: 'app',
            name: 'gatewaynext',
            prefix: '/edge/gateway',
            monolithEnabled: true,
            loadEnv: false,
            loadRoutes: async () => {
              const { Router } = await import('@core-routes/Router');
              return {
                registerRoutes(router: unknown) {
                  Router.get(router as any, '/', () => undefined);
                },
              };
            },
          },
        ],
      },
    }));

    const { Router } = await import('@core-routes/Router');
    const { registerMasterRoutes } = await import('@registry/registerRoute');
    const router = Router.createRouter();

    await registerMasterRoutes('/missing', router);

    expect(ensureLoaded).not.toHaveBeenCalled();
    expect(Router.match(router, 'GET', '/edge/gateway')).not.toBeNull();
  });

  it('registerMasterRoutes skips disabled, missing, and mismatched manifest entries', async () => {
    const registerCoreRoutes = vi.fn();
    vi.doMock('@core-routes/CoreRoutes', () => ({ registerCoreRoutes }));
    vi.doMock('@runtime/detectRuntime', () => ({ detectRuntime: () => ({ isCloudflare: false }) }));
    vi.doMock('@/config', () => ({ appConfig: { isDevelopment: () => true } }));
    const ensureLoaded = vi.fn();
    vi.doMock('@cli/utils/EnvFileLoader', () => ({
      EnvFileLoader: {
        ensureLoaded,
      },
    }));

    const mismatchedLoadRoutes = vi.fn(async () => ({ registerRoutes: vi.fn() }));
    vi.doMock('@runtime/ProjectRuntime', () => ({
      ProjectRuntime: {
        tryLoadNodeRuntime: vi.fn(async () => undefined),
        getActiveService: () => ({ id: 'app/active', domain: 'app', name: 'active' }),
        getServiceManifest: () => [
          {
            id: 'app/disabled',
            domain: 'app',
            name: 'disabled',
            monolithEnabled: false,
            loadRoutes: vi.fn(async () => ({ registerRoutes: vi.fn() })),
          },
          {
            id: 'app/missing',
            domain: 'app',
            name: 'missing',
            monolithEnabled: true,
          },
          {
            id: 'app/other',
            domain: 'app',
            name: 'other',
            monolithEnabled: true,
            loadRoutes: mismatchedLoadRoutes,
          },
        ],
      },
    }));

    const { Router } = await import('@core-routes/Router');
    const { registerMasterRoutes } = await import('@registry/registerRoute');
    const router = Router.createRouter();

    await registerMasterRoutes('/missing', router);

    expect(ensureLoaded).not.toHaveBeenCalled();
    expect(mismatchedLoadRoutes).not.toHaveBeenCalled();
    expect(registerCoreRoutes).toHaveBeenCalledWith(router);
  });

  it('registerMasterRoutes warns when manifest route registration fails', async () => {
    const warn = vi.fn();
    vi.doMock('@config/logger', () => ({
      default: {
        warn,
        error: vi.fn(),
      },
    }));
    vi.doMock('@core-routes/CoreRoutes', () => ({ registerCoreRoutes: vi.fn() }));
    vi.doMock('@runtime/detectRuntime', () => ({ detectRuntime: () => ({ isCloudflare: false }) }));
    vi.doMock('@/config', () => ({ appConfig: { isDevelopment: () => true } }));
    vi.doMock('@cli/utils/EnvFileLoader', () => ({
      EnvFileLoader: {
        ensureLoaded: vi.fn(),
      },
    }));
    vi.doMock('@runtime/ProjectRuntime', () => ({
      ProjectRuntime: {
        tryLoadNodeRuntime: vi.fn(async () => undefined),
        getActiveService: () => undefined,
        getServiceManifest: () => [
          {
            id: 'app/failing',
            domain: 'app',
            name: 'failing',
            monolithEnabled: true,
            loadRoutes: async () => {
              throw new Error('boom');
            },
          },
        ],
      },
    }));

    const { Router } = await import('@core-routes/Router');
    const { registerMasterRoutes } = await import('@registry/registerRoute');
    const router = Router.createRouter();

    await registerMasterRoutes('/missing', router);

    expect(warn).toHaveBeenCalledWith(
      'Failed to register manifest routes for app/failing',
      expect.any(Error)
    );
  });
});
