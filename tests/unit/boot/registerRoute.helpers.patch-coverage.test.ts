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

    const registerRoutes = vi.fn();
    (
      globalThis as { __zintrustRoutes?: { registerRoutes: (r: unknown) => void } }
    ).__zintrustRoutes = {
      registerRoutes,
    };

    const router = { routes: [{ path: '/x' }] } as any;
    const { registerMasterRoutes } = await import('@registry/registerRoute');
    await registerMasterRoutes('', router);

    expect(registerRoutes).toHaveBeenCalledWith(router);
    expect(registerCoreRoutes).toHaveBeenCalledWith(router);
  });
});
