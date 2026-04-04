import { socketRouteRegistrar, socketRuntime } from './index.js';

type CoreApi = {
  SocketRuntimeRegistry?: {
    registerRuntime: (runtime: typeof socketRuntime) => void;
    registerRoutes: (routeRegistrar: typeof socketRouteRegistrar) => void;
  };
};

type SocketRuntimeRegistryState = {
  runtime?: typeof socketRuntime;
  routeRegistrar?: typeof socketRouteRegistrar;
};

type SocketRuntimeRegistryGlobal = typeof globalThis & {
  __zintrustSocketRuntimeRegistry?: SocketRuntimeRegistryState;
};

const registerViaGlobalFallback = (): void => {
  const globalRegistry = globalThis as SocketRuntimeRegistryGlobal;
  globalRegistry.__zintrustSocketRuntimeRegistry = {
    ...globalRegistry.__zintrustSocketRuntimeRegistry,
    runtime: socketRuntime,
    routeRegistrar: socketRouteRegistrar,
  };
};

const importCore = async (): Promise<CoreApi> => {
  try {
    return (await import('@zintrust/core')) as CoreApi;
  } catch {
    return {};
  }
};

const core = await importCore();
if (core.SocketRuntimeRegistry === undefined) {
  registerViaGlobalFallback();
} else {
  core.SocketRuntimeRegistry.registerRuntime(socketRuntime);
  core.SocketRuntimeRegistry.registerRoutes(socketRouteRegistrar);
}

export type {};
