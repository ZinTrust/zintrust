import type { IMiddlewareStack } from '@/middleware';
import type { IServiceContainer } from '@container/ServiceContainer';
import type { IRouter } from '@core-routes/Router';

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

export type RoutesModule = { registerRoutes?: (r: IRouter) => void };

export type ShutdownHook = () => void | Promise<void>;

export interface IShutdownManager {
  add(hook: ShutdownHook): void;
  run(): Promise<void>;
}
