import { afterEach, describe, expect, it, vi } from 'vitest';

describe('runtime debugger plugin shims', () => {
  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('falls back to the local debugger plugin when the package import fails', async () => {
    const fallbackPluginSpy = vi.fn();

    vi.doMock('@zintrust/system-debugger/plugin', () => {
      throw new Error('missing plugin package');
    });
    vi.doMock('../../../packages/system-debugger/src/plugin', () => {
      fallbackPluginSpy();
      return {};
    });

    await import('@runtime/plugins/system-debugger');

    expect(fallbackPluginSpy).toHaveBeenCalledTimes(1);
  });

  it('exposes safe fallbacks when the debugger runtime module is unavailable', async () => {
    const registerSpy = vi.fn();

    vi.doMock('@zintrust/system-debugger', () => {
      throw new Error('debugger unavailable');
    });
    vi.doMock('@zintrust/system-debugger/register', () => {
      registerSpy();
      return {};
    });

    const runtimeModule = await import('@runtime/plugins/system-debugger-runtime');

    expect(runtimeModule.isAvailable()).toBe(false);
    expect(runtimeModule.DebuggerConfig.merge()).toEqual({ enabled: false });
    expect(runtimeModule.DebuggerStorage.resolveStorage({})).toBeUndefined();
    expect(runtimeModule.registerDebuggerRoutes({}, {}, { basePath: '/debugger' })).toBeUndefined();

    await expect(runtimeModule.ensureSystemDebuggerRegistered()).resolves.toBeUndefined();
    expect(registerSpy).not.toHaveBeenCalled();
  });

  it('proxies debugger runtime helpers when the optional module is installed', async () => {
    const mergeSpy = vi.fn(() => ({ enabled: true, connection: 'primary' }));
    const resolveStorageSpy = vi.fn(() => ({ stats: vi.fn() }));
    const registerRoutesSpy = vi.fn();

    vi.doMock('@zintrust/system-debugger', () => ({
      DebuggerConfig: { merge: mergeSpy },
      DebuggerStorage: { resolveStorage: resolveStorageSpy },
      registerDebuggerRoutes: registerRoutesSpy,
    }));
    vi.doMock('@zintrust/system-debugger/register', () => ({}));

    const runtimeModule = await import('@runtime/plugins/system-debugger-runtime');

    expect(runtimeModule.isAvailable()).toBe(true);
    expect(runtimeModule.DebuggerConfig.merge({ env: 'test' })).toEqual({
      enabled: true,
      connection: 'primary',
    });
    expect(runtimeModule.DebuggerStorage.resolveStorage({ db: true })).toEqual({
      stats: expect.any(Function),
    });

    runtimeModule.registerDebuggerRoutes('router', 'storage', { basePath: '/debugger' });
    expect(registerRoutesSpy).toHaveBeenCalledWith('router', 'storage', {
      basePath: '/debugger',
    });

    await runtimeModule.ensureSystemDebuggerRegistered();
  });
});
