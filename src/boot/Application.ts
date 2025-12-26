/**
 * Application - Framework core entry point
 * Handles application lifecycle, booting, and environment
 */

import { IServiceContainer, ServiceContainer } from '@/container/ServiceContainer';
import { IMiddlewareStack, MiddlewareStack } from '@/middleware/MiddlewareStack';
import { type IRouter, Router } from '@/routing/Router';
import { Env } from '@config/env';
import { Logger } from '@config/logger';
import * as path from '@node-singletons/path';
import { pathToFileURL } from '@node-singletons/url';

export interface IApplication {
  boot(): Promise<void>;
  shutdown(): Promise<void>;
  isBooted(): boolean;
  isDevelopment(): boolean;
  isProduction(): boolean;
  isTesting(): boolean;
  getEnvironment(): string;
  getRouter(): IRouter;
  getContainer(): IServiceContainer;
  getMiddlewareStack(): IMiddlewareStack;
  getBasePath(): string;
}

type RoutesModule = { registerRoutes?: (r: IRouter) => void };

type ShutdownHook = () => void | Promise<void>;

interface IShutdownManager {
  add(hook: ShutdownHook): void;
  run(): Promise<void>;
}

const ShutdownManager = Object.freeze({
  create(): IShutdownManager {
    const hooks: ShutdownHook[] = [];

    return Object.freeze({
      add(hook: ShutdownHook): void {
        hooks.push(hook);
      },
      async run(): Promise<void> {
        for (const hook of hooks) {
          // eslint-disable-next-line no-await-in-loop
          await hook();
        }
      },
    });
  },
});

const resolveBasePath = (basePath?: string): string => {
  if (typeof basePath === 'string') return basePath;
  if (typeof process !== 'undefined' && typeof process.cwd === 'function') return process.cwd();
  return '';
};

const makeJoinFromBase =
  (resolvedBasePath: string) =>
  (subPath: string): string => {
    return resolvedBasePath.length > 0 ? `${resolvedBasePath}/${subPath}` : subPath;
  };

const registerCorePaths = (
  container: IServiceContainer,
  resolvedBasePath: string,
  joinFromBase: (subPath: string) => string
): void => {
  container.singleton('paths', {
    base: resolvedBasePath,
    app: joinFromBase('app'),
    config: joinFromBase('config'),
    database: joinFromBase('database'),
    routes: joinFromBase('routes'),
    tests: joinFromBase('tests'),
  });
};

const registerCoreInstances = (params: {
  container: IServiceContainer;
  environment: string;
  router: IRouter;
  middlewareStack: IMiddlewareStack;
  shutdownManager: IShutdownManager;
}): void => {
  params.container.singleton('env', params.environment);
  params.container.singleton('router', params.router);
  params.container.singleton('middleware', params.middlewareStack);
  params.container.singleton('container', params.container);
  params.container.singleton('shutdownManager', params.shutdownManager);
};

const tryImportRoutesFromAppBase = async (
  resolvedBasePath: string
): Promise<RoutesModule | undefined> => {
  if (resolvedBasePath === '') return undefined;

  const candidates = [
    // Dev (tsx)
    path.join(resolvedBasePath, 'routes', 'api.ts'),
    // Production build output
    path.join(resolvedBasePath, 'dist', 'routes', 'api.js'),
    // Fallback (in case someone transpiles without /dist)
    path.join(resolvedBasePath, 'routes', 'api.js'),
  ];

  for (const candidate of candidates) {
    try {
      const url = pathToFileURL(candidate).href;
      // eslint-disable-next-line no-await-in-loop
      return (await import(url)) as RoutesModule;
    } catch {
      // keep trying
    }
  }

  return undefined;
};

const registerRoutes = async (resolvedBasePath: string, router: IRouter): Promise<void> => {
  try {
    const mod = await tryImportRoutesFromAppBase(resolvedBasePath);
    if (typeof mod?.registerRoutes === 'function') {
      mod.registerRoutes(router);
      return;
    }

    const { registerRoutes: registerFrameworkRoutes } = await import('../../routes/api');
    registerFrameworkRoutes(router);
  } catch (error: unknown) {
    Logger.error('Failed to register routes:', error as Error);
  }
};

const createLifecycle = (params: {
  environment: string;
  resolvedBasePath: string;
  router: IRouter;
  shutdownManager: IShutdownManager;
  getBooted: () => boolean;
  setBooted: (value: boolean) => void;
}): { boot: () => Promise<void>; shutdown: () => Promise<void> } => {
  const boot = async (): Promise<void> => {
    if (params.getBooted()) return;

    Logger.info(`🚀 Booting Zintrust Application in ${params.environment} mode...`);
    await registerRoutes(params.resolvedBasePath, params.router);

    // Register service providers
    // Bootstrap services

    params.setBooted(true);
    Logger.info('✅ Application booted successfully');
  };

  const shutdown = async (): Promise<void> => {
    Logger.info('🛑 Shutting down application...');

    try {
      await params.shutdownManager.run();
    } catch (error: unknown) {
      Logger.error('Shutdown hook failed:', error as Error);
    }

    Logger.info('✅ Application shut down successfully');
    params.setBooted(false);
  };

  return { boot, shutdown };
};

/**
 * Application Factory
 */
export const Application = Object.freeze({
  /**
   * Create a new application instance
   */
  create(basePath?: string): IApplication {
    const resolvedBasePath = resolveBasePath(basePath);
    const joinFromBase = makeJoinFromBase(resolvedBasePath);

    const environment = Env.get('NODE_ENV', 'development');
    const container = ServiceContainer.create();
    const router = Router.createRouter();
    const middlewareStack = MiddlewareStack.create();
    const shutdownManager = ShutdownManager.create();

    let booted = false;

    registerCorePaths(container, resolvedBasePath, joinFromBase);
    registerCoreInstances({ container, environment, router, middlewareStack, shutdownManager });

    const { boot, shutdown } = createLifecycle({
      environment,
      resolvedBasePath,
      router,
      shutdownManager,
      getBooted: () => booted,
      setBooted: (value: boolean) => {
        booted = value;
      },
    });

    return {
      boot,
      shutdown,
      isBooted: (): boolean => booted,
      isDevelopment: (): boolean => environment === 'development',
      isProduction: (): boolean => environment === 'production',
      isTesting: (): boolean => environment === 'testing' || environment === 'test',
      getEnvironment: (): string => environment,
      getRouter: (): IRouter => router,
      getContainer: (): IServiceContainer => container,
      getMiddlewareStack: (): IMiddlewareStack => middlewareStack,
      getBasePath: (): string => resolvedBasePath,
    };
  },
});

export default Application;
