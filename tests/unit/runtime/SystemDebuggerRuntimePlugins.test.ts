import { afterEach, describe, expect, it, vi } from 'vitest';

describe('runtime trace plugin shims', () => {
  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('falls back to the local trace plugin when the package import fails', async () => {
    const fallbackPluginSpy = vi.fn();

    vi.doMock('@zintrust/trace/plugin', () => {
      throw new Error('missing plugin package');
    });
    vi.doMock('../../../packages/trace/src/plugin', () => {
      fallbackPluginSpy();
      return {};
    });

    await import('@runtime/plugins/trace');

    expect(fallbackPluginSpy).toHaveBeenCalledTimes(1);
  });

  it('exposes safe fallbacks when the trace runtime module is unavailable', async () => {
    const registerSpy = vi.fn();

    vi.doMock('@zintrust/trace', () => {
      throw new Error('trace unavailable');
    });
    vi.doMock('@zintrust/trace/register', () => {
      registerSpy();
      return {};
    });

    const runtimeModule = await import('@runtime/plugins/trace-runtime');

    expect(runtimeModule.isAvailable()).toBe(false);
    expect(runtimeModule.TraceConfig.merge()).toEqual({ enabled: false });
    expect(runtimeModule.TraceStorage.resolveStorage({})).toBeUndefined();
    expect(runtimeModule.registerTraceDashboard({}, { basePath: '/trace' })).toBeUndefined();
    expect(runtimeModule.registerTraceRoutes({}, {}, { basePath: '/trace' })).toBeUndefined();

    await expect(runtimeModule.ensureSystemTraceRegistered()).resolves.toBeUndefined();
    expect(registerSpy).not.toHaveBeenCalled();
  });

  it('proxies trace runtime helpers when the optional module is installed', async () => {
    const mergeSpy = vi.fn(() => ({ enabled: true, connection: 'primary' }));
    const resolveStorageSpy = vi.fn(() => ({ stats: vi.fn() }));
    const registerDashboardSpy = vi.fn();
    const registerRoutesSpy = vi.fn();

    vi.doMock('@zintrust/trace', () => ({
      TraceConfig: { merge: mergeSpy },
      TraceStorage: { resolveStorage: resolveStorageSpy },
      registerTraceDashboard: registerDashboardSpy,
      registerTraceRoutes: registerRoutesSpy,
    }));
    vi.doMock('@zintrust/trace/register', () => ({}));

    const runtimeModule = await import('@runtime/plugins/trace-runtime');

    expect(runtimeModule.isAvailable()).toBe(true);
    expect(runtimeModule.TraceConfig.merge({ env: 'test' })).toEqual({
      enabled: true,
      connection: 'primary',
    });
    expect(runtimeModule.TraceStorage.resolveStorage({ db: true })).toEqual({
      stats: expect.any(Function),
    });

    runtimeModule.registerTraceDashboard('router', {
      basePath: '/trace',
      middleware: ['admin'],
    });
    expect(registerDashboardSpy).toHaveBeenCalledWith('router', {
      basePath: '/trace',
      middleware: ['admin'],
    });

    runtimeModule.registerTraceRoutes('router', 'storage', { basePath: '/trace' });
    expect(registerRoutesSpy).toHaveBeenCalledWith('router', 'storage', {
      basePath: '/trace',
    });

    await runtimeModule.ensureSystemTraceRegistered();
  });
});
