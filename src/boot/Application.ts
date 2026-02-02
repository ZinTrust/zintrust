/**
 * Application - Framework core entry point
 * Handles application lifecycle, booting, and environment
 */

import { appConfig } from '@/config';
import type { IServiceContainer } from '@/container/ServiceContainer';
import { ServiceContainer } from '@/container/ServiceContainer';
import type { IMiddlewareStack } from '@/middleware/MiddlewareStack';
import { MiddlewareStack } from '@/middleware/MiddlewareStack';

import { type IRouter, Router } from '@core-routes/Router';
import { createLifecycle, registerFrameworkShutdownHooks } from '@registry/runtime';
import type { IApplication, IShutdownManager, ShutdownHook } from '@registry/type';

const ShutdownManager = Object.freeze({
  create(): IShutdownManager {
    const hooks: ShutdownHook[] = [];

    return Object.freeze({
      add(hook: ShutdownHook): void {
        hooks.push(hook);
      },
      async run(): Promise<void> {
        // Run hooks in parallel for better performance
        await Promise.all(hooks.map(async (hook) => hook()));
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

    const environment = appConfig.environment;
    const container = ServiceContainer.create();
    const router = Router.createRouter();
    const middlewareStack = MiddlewareStack.create();
    const shutdownManager = ShutdownManager.create();

    let booted = false;

    registerCorePaths(container, resolvedBasePath, joinFromBase);
    registerCoreInstances({ container, environment, router, middlewareStack, shutdownManager });

    registerFrameworkShutdownHooks(shutdownManager);

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
      isDevelopment: (): boolean => appConfig.isDevelopment(),
      isProduction: (): boolean => appConfig.isProduction(),
      isTesting: (): boolean => appConfig.isTesting(),
      getEnvironment: (): string => environment,
      getRouter: (): IRouter => router,
      getContainer: (): IServiceContainer => container,
      getMiddlewareStack: (): IMiddlewareStack => middlewareStack,
      getBasePath: (): string => resolvedBasePath,
    };
  },
});

export default Application;
