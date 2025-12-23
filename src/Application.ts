/**
 * Application - Framework core entry point
 * Handles application lifecycle, booting, and environment
 */

import { IServiceContainer, ServiceContainer } from '@/container/ServiceContainer';
import { IMiddlewareStack, MiddlewareStack } from '@/middleware/MiddlewareStack';
import { type IRouter, Router } from '@/routing/Router';
import { Env } from '@config/env';
import { Logger } from '@config/logger';

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

/**
 * Application Factory
 */
export const Application = Object.freeze({
  /**
   * Create a new application instance
   */
  create(basePath: string = process.cwd()): IApplication {
    const environment = Env.get('NODE_ENV', 'development');
    const container = ServiceContainer.create();
    const router = Router.createRouter();
    const middlewareStack = MiddlewareStack.create();
    let booted = false;

    // Register core paths
    container.singleton('paths', {
      base: basePath,
      app: `${basePath}/app`,
      config: `${basePath}/config`,
      database: `${basePath}/database`,
      routes: `${basePath}/routes`,
      tests: `${basePath}/tests`,
    });

    // Register core instances
    container.singleton('env', environment);
    container.singleton('router', router);
    container.singleton('middleware', middlewareStack);
    container.singleton('container', container);

    /**
     * Boot the application
     */
    async function boot(): Promise<void> {
      if (booted) return;

      Logger.info(`🚀 Booting Zintrust Application in ${environment} mode...`);

      // Load configuration
      // Load routes
      // Register service providers
      // Bootstrap services

      booted = true;
      Logger.info('✅ Application booted successfully');
    }

    /**
     * Shutdown the application
     */
    async function shutdown(): Promise<void> {
      Logger.info('🛑 Shutting down application...');
      // Cleanup resources
      booted = false;
    }

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
      getBasePath: (): string => basePath,
    };
  },
});

export default Application;
