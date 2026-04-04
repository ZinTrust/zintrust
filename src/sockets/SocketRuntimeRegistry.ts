import type {
  SocketRouteRegistrar,
  SocketRuntime,
  SocketRuntimeDiagnostics,
} from '@sockets/SocketRuntime';

type RegistryState = {
  runtime?: SocketRuntime;
  routeRegistrar?: SocketRouteRegistrar;
};

type RegistryGlobal = typeof globalThis & {
  __zintrustSocketRuntimeRegistry?: RegistryState;
};

const getRegistryGlobal = (): RegistryGlobal => globalThis as RegistryGlobal;

const getState = (): RegistryState => {
  const globalRegistry = getRegistryGlobal();
  globalRegistry.__zintrustSocketRuntimeRegistry ??= {};
  return globalRegistry.__zintrustSocketRuntimeRegistry;
};

const getDiagnostics = (): SocketRuntimeDiagnostics | null => {
  const runtime = getState().runtime;
  return runtime?.describe() ?? null;
};

export const SocketRuntimeRegistry = Object.freeze({
  registerRuntime(runtime: SocketRuntime): void {
    getState().runtime = runtime;
  },

  getRuntime(): SocketRuntime | undefined {
    return getState().runtime;
  },

  registerRoutes(routeRegistrar: SocketRouteRegistrar): void {
    getState().routeRegistrar = routeRegistrar;
  },

  getRouteRegistrar(): SocketRouteRegistrar | undefined {
    return getState().routeRegistrar;
  },

  getDiagnostics,

  reset(): void {
    delete getRegistryGlobal().__zintrustSocketRuntimeRegistry;
  },
});

export default SocketRuntimeRegistry;
