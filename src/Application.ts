/**
 * Application - Core Zintrust Application Class
 * Manages framework lifecycle, service registration, and bootstrapping
 */

import { appConfig } from '@config/app';
import { ServiceContainer } from '@container/ServiceContainer';
import { MiddlewareStack } from '@middleware/MiddlewareStack';
import { Router } from '@routing/EnhancedRouter';

export class Application {
  private readonly container: ServiceContainer;
  private readonly router: Router;
  private readonly middlewareStack: MiddlewareStack;
  private readonly environment: string;

  constructor(baseDirectory: string) {
    this.container = new ServiceContainer();
    this.router = new Router();
    this.middlewareStack = new MiddlewareStack();
    this.environment = appConfig.environment;

    this.registerCoreServices(baseDirectory);
  }

  /**
   * Register core framework services
   */
  private registerCoreServices(baseDirectory: string): void {
    // Register framework paths
    this.container.singleton('paths', {
      base: baseDirectory,
      app: `${baseDirectory}/app`,
      config: `${baseDirectory}/config`,
      database: `${baseDirectory}/database`,
      routes: `${baseDirectory}/routes`,
      tests: `${baseDirectory}/tests`,
    });

    // Register environment
    this.container.singleton('env', this.environment);

    // Register router
    this.container.singleton('router', this.router);

    // Register middleware stack
    this.container.singleton('middleware', this.middlewareStack);

    // Register container itself
    this.container.singleton('container', this.container);
  }

  /**
   * Get the service container
   */
  public getContainer(): ServiceContainer {
    return this.container;
  }

  /**
   * Get the router instance
   */
  public getRouter(): Router {
    return this.router;
  }

  /**
   * Get the middleware stack instance
   */
  public getMiddlewareStack(): MiddlewareStack {
    return this.middlewareStack;
  }

  /**
   * Check if application is in development mode
   */
  public isDevelopment(): boolean {
    return this.environment === 'development';
  }

  /**
   * Check if application is in production mode
   */
  public isProduction(): boolean {
    return this.environment === 'production';
  }

  /**
   * Check if application is in testing mode
   */
  public isTesting(): boolean {
    return this.environment === 'testing';
  }

  /**
   * Get environment
   */
  public getEnvironment(): string {
    return this.environment;
  }

  /**
   * Boot the application
   */
  public async boot(): Promise<void> {
    // Load configuration
    // Load routes
    // Register service providers
    // Bootstrap services
  }
}
