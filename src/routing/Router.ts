/**
 * Router - HTTP Routing Engine
 * Matches incoming requests to route handlers
 */

import { Request } from '@http/Request';
import { Response } from '@http/Response';

export type RouteHandler = (req: Request, res: Response) => Promise<void> | void;

interface RouteMatch {
  handler: RouteHandler;
  params: Record<string, string>;
}

interface Route {
  method: string;
  path: string;
  pattern: RegExp;
  handler: RouteHandler;
  paramNames: string[];
}

export class Router {
  private readonly routes: Route[] = [];

  /**
   * Register a GET route
   */
  public get(path: string, handler: RouteHandler): void {
    this.registerRoute('GET', path, handler);
  }

  /**
   * Register a POST route
   */
  public post(path: string, handler: RouteHandler): void {
    this.registerRoute('POST', path, handler);
  }

  /**
   * Register a PUT route
   */
  public put(path: string, handler: RouteHandler): void {
    this.registerRoute('PUT', path, handler);
  }

  /**
   * Register a PATCH route
   */
  public patch(path: string, handler: RouteHandler): void {
    this.registerRoute('PATCH', path, handler);
  }

  /**
   * Register a DELETE route
   */
  public delete(path: string, handler: RouteHandler): void {
    this.registerRoute('DELETE', path, handler);
  }

  /**
   * Register a route for all methods
   */
  public any(path: string, handler: RouteHandler): void {
    ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].forEach((method) => {
      this.registerRoute(method, path, handler);
    });
  }

  /**
   * Register a route
   */
  private registerRoute(method: string, path: string, handler: RouteHandler): void {
    const { pattern, paramNames } = this.pathToRegex(path);
    this.routes.push({
      method,
      path,
      pattern,
      handler,
      paramNames,
    });
  }

  /**
   * Match a request to a route
   */
  public match(method: string, path: string): RouteMatch | null {
    for (const route of this.routes) {
      if (route.method === method || route.method === '*') {
        const match = route.pattern.exec(path);
        if (match) {
          const params: Record<string, string> = {};
          route.paramNames.forEach((paramName, index) => {
            params[paramName] = match[index + 1];
          });
          return {
            handler: route.handler,
            params,
          };
        }
      }
    }
    return null;
  }

  /**
   * Convert a path pattern to a regex
   * Example: /users/:id/posts/:postId -> /users/([^/]+)/posts/([^/]+)
   */
  private pathToRegex(path: string): { pattern: RegExp; paramNames: string[] } {
    const paramNames: string[] = [];
    let regexPath = path.replaceAll(/:([a-zA-Z_]\w*)/g, (_, paramName) => {
      paramNames.push(paramName);
      return '([^/]+)';
    });

    regexPath = `^${regexPath}$`;
    const pattern = new RegExp(regexPath);

    return { pattern, paramNames };
  }

  /**
   * Get all registered routes
   */
  public getRoutes(): Route[] {
    return this.routes;
  }
}
