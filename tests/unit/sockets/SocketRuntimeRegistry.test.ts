import { afterEach, describe, expect, it } from 'vitest';

import { SocketRuntimeRegistry } from '../../../src/sockets/SocketRuntimeRegistry';

describe('SocketRuntimeRegistry', () => {
  afterEach(() => {
    SocketRuntimeRegistry.reset();
  });

  it('stores runtime diagnostics and route registrars', () => {
    const runtime = {
      describe: () => ({
        enabled: true,
        transport: 'node' as const,
        path: '/app',
        appKeyConfigured: true,
      }),
    } as any;
    const routeRegistrar = {
      registerRoutes: () => undefined,
    } as any;

    SocketRuntimeRegistry.registerRuntime(runtime);
    SocketRuntimeRegistry.registerRoutes(routeRegistrar);

    expect(SocketRuntimeRegistry.getRuntime()).toBe(runtime);
    expect(SocketRuntimeRegistry.getRouteRegistrar()).toBe(routeRegistrar);
    expect(SocketRuntimeRegistry.getDiagnostics()).toEqual({
      enabled: true,
      transport: 'node',
      path: '/app',
      appKeyConfigured: true,
    });
  });

  it('returns null diagnostics after reset', () => {
    SocketRuntimeRegistry.registerRuntime({
      describe: () => ({
        enabled: true,
        transport: 'node' as const,
        path: '/app',
        appKeyConfigured: true,
      }),
    } as any);

    SocketRuntimeRegistry.reset();

    expect(SocketRuntimeRegistry.getRuntime()).toBeUndefined();
    expect(SocketRuntimeRegistry.getRouteRegistrar()).toBeUndefined();
    expect(SocketRuntimeRegistry.getDiagnostics()).toBeNull();
  });
});
