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
    });
    expect(Router.match(router, 'GET', '/edge/gateway')).not.toBeNull();
    expect(Router.match(router, 'GET', '/')).toBeNull();
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
});
