/**
 * HTTP Kernel
 * Orchestrates request lifecycle: middleware -> route handler -> response
 */

import { Logger } from '@config/logger';
import { ServiceContainer } from '@container/ServiceContainer';
import { Request } from '@http/Request';
import { Response } from '@http/Response';
import { Middleware, MiddlewareStack } from '@middleware/MiddlewareStack';
import { RequestProfiler } from '@profiling/RequestProfiler';
import { Router } from '@routing/EnhancedRouter';
import * as http from 'node:http';

export class Kernel {
  private readonly router: Router;
  private readonly middlewareStack: MiddlewareStack;
  private readonly container: ServiceContainer;
  private readonly globalMiddleware: string[] = [];
  private readonly routeMiddleware: Map<string, Middleware> = new Map();

  constructor(router: Router, middlewareStack: MiddlewareStack, container: ServiceContainer) {
    this.router = router;
    this.middlewareStack = middlewareStack;
    this.container = container;
  }

  /**
   * Register global middleware (runs on every request)
   */
  public registerGlobalMiddleware(...names: string[]): void {
    this.globalMiddleware.push(...names);
  }

  /**
   * Register route middleware
   */
  public registerRouteMiddleware(name: string, handler: Middleware): void {
    this.routeMiddleware.set(name, handler);
    this.middlewareStack.register(name, handler);
  }

  /**
   * Handle incoming HTTP request
   */
  public async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    try {
      const request = new Request(req);
      const response = new Response(res);

      // Check if profiling is requested via header
      const shouldProfile = req.headers['x-profile'] === 'true';
      const profiler = shouldProfile ? new RequestProfiler() : null;

      const executeRequest = async (): Promise<void> => {
        // Global middleware (before route)
        await this.middlewareStack.execute(request, response, this.globalMiddleware);

        // Route matching
        const route = this.router.match(request.getMethod(), request.getPath());

        if (!route) {
          // 404 Not Found
          response.setStatus(404).json({ message: 'Not Found' });
          return;
        }

        // Set route parameters on request
        request.setParams(route.params);

        // Route-specific middleware
        if (route.middleware.length > 0) {
          await this.middlewareStack.execute(request, response, route.middleware);
        }

        // Execute route handler
        await route.handler(request, response);

        // If response not sent, respond with 200
        if (!res.writableEnded) {
          response.setStatus(200).json({ message: 'OK' });
        }
      };

      // Execute with or without profiling
      if (profiler) {
        const profile = await profiler.captureRequest(executeRequest);
        // Store profile in response locals
        response.locals['profile'] = profile;
      } else {
        await executeRequest();
      }
    } catch (error) {
      Logger.error('Kernel error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: 'Internal Server Error' }));
    }
  }

  /**
   * Get router instance
   */
  public getRouter(): Router {
    return this.router;
  }

  /**
   * Get middleware stack
   */
  public getMiddlewareStack(): MiddlewareStack {
    return this.middlewareStack;
  }

  /**
   * Get service container
   */
  public getContainer(): ServiceContainer {
    return this.container;
  }
}
