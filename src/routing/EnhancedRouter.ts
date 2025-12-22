/**
 * Enhanced Router with Route Groups and Resource Routes
 * Declarative routing API with intuitive syntax
 */

import { Request } from '@http/Request';
import { Response } from '@http/Response';

export type RouteHandler = (req: Request, res: Response) => Promise<void> | void;
export type Middleware = (req: Request, res: Response, next: () => Promise<void>) => Promise<void>;

export interface RegisteredRoute {
  method: string;
  path: string;
  name?: string;
  pattern: RegExp;
  handler: RouteHandler;
  paramNames: string[];
  middleware: string[];
}

export interface RouteMatch {
  handler: RouteHandler;
  params: Record<string, string>;
  middleware: string[];
  name?: string;
}

export class Router {
  private readonly routes: RegisteredRoute[] = [];
  private readonly nameMap = new Map<string, RegisteredRoute>();
  private currentGroup?: { prefix: string; middleware: string[] };

  /**
   * Register a GET route
   */
  public get(path: string, handler: RouteHandler, name?: string): RegisteredRoute {
    return this.registerRoute('GET', path, handler, name);
  }

  /**
   * Register a POST route
   */
  public post(path: string, handler: RouteHandler, name?: string): RegisteredRoute {
    return this.registerRoute('POST', path, handler, name);
  }

  /**
   * Register a PUT route
   */
  public put(path: string, handler: RouteHandler, name?: string): RegisteredRoute {
    return this.registerRoute('PUT', path, handler, name);
  }

  /**
   * Register a PATCH route
   */
  public patch(path: string, handler: RouteHandler, name?: string): RegisteredRoute {
    return this.registerRoute('PATCH', path, handler, name);
  }

  /**
   * Register a DELETE route
   */
  public delete(path: string, handler: RouteHandler, name?: string): RegisteredRoute {
    return this.registerRoute('DELETE', path, handler, name);
  }

  /**
   * Register a route for all methods
   */
  public any(path: string, handler: RouteHandler, name?: string): RegisteredRoute {
    return this.registerRoute('*', path, handler, name);
  }

  /**
   * Register resource routes (CRUD)
   */
  public resource(
    resource: string,
    controller: {
      index: RouteHandler;
      create: RouteHandler;
      store: RouteHandler;
      show: RouteHandler;
      edit: RouteHandler;
      update: RouteHandler;
      destroy: RouteHandler;
    }
  ): void {
    // GET /resources
    this.get(`/${resource}`, controller.index, `${resource}.index`);
    // GET /resources/create
    this.get(`/${resource}/create`, controller.create, `${resource}.create`);
    // POST /resources
    this.post(`/${resource}`, controller.store, `${resource}.store`);
    // GET /resources/:id
    this.get(`/${resource}/:id`, controller.show, `${resource}.show`);
    // GET /resources/:id/edit
    this.get(`/${resource}/:id/edit`, controller.edit, `${resource}.edit`);
    // PUT /resources/:id
    this.put(`/${resource}/:id`, controller.update, `${resource}.update`);
    // DELETE /resources/:id
    this.delete(`/${resource}/:id`, controller.destroy, `${resource}.destroy`);
  }

  /**
   * Create a route group with shared prefix and middleware
   */
  public group(
    options: { prefix?: string; middleware?: string[] },
    callback: (router: Router) => void
  ): void {
    const prevGroup = this.currentGroup;

    // Compose prefixes and middleware for nested groups
    const prefix = (prevGroup?.prefix ?? '') + (options.prefix ?? '');
    const middleware = [...(prevGroup?.middleware ?? []), ...(options.middleware ?? [])];

    this.currentGroup = {
      prefix,
      middleware,
    };

    callback(this);

    this.currentGroup = prevGroup;
  }

  /**
   * Register a route
   */
  private registerRoute(
    method: string,
    path: string,
    handler: RouteHandler,
    name?: string
  ): RegisteredRoute {
    // Apply group prefix and middleware
    let fullPath = path;
    let middleware: string[] = [];

    if (this.currentGroup !== undefined) {
      fullPath = this.currentGroup.prefix + path;
      middleware = [...this.currentGroup.middleware];
    }

    const { pattern, paramNames } = this.pathToRegex(fullPath);

    const route: RegisteredRoute = {
      method,
      path: fullPath,
      name,
      pattern,
      handler,
      paramNames,
      middleware,
    };

    this.routes.push(route);

    if (name !== undefined) {
      this.nameMap.set(name, route);
    }

    return route;
  }

  /**
   * Match a request to a route
   */
  public match(method: string, path: string): RouteMatch | null {
    for (const route of this.routes) {
      if ((route.method === method || route.method === '*') && route.pattern.test(path)) {
        const match = route.pattern.exec(path);
        if (match !== null) {
          const params: Record<string, string> = {};
          route.paramNames.forEach((paramName, index) => {
            params[paramName] = match[index + 1];
          });

          return {
            handler: route.handler,
            params,
            middleware: route.middleware,
            name: route.name,
          };
        }
      }
    }
    return null;
  }

  /**
   * Get route by name
   */
  public getByName(name: string): RegisteredRoute | undefined {
    return this.nameMap.get(name);
  }

  /**
   * Generate URL for named route
   */
  public url(name: string, params: Record<string, string> = {}): string | null {
    const route = this.nameMap.get(name);
    if (route === undefined) return null;

    let url = route.path;
    for (const [key, value] of Object.entries(params)) {
      url = url.replaceAll(`:${key}`, value);
    }
    return url;
  }

  /**
   * Get all registered routes
   */
  public getRoutes(): RegisteredRoute[] {
    return this.routes;
  }

  /**
   * Convert path pattern to regex
   */
  private pathToRegex(path: string): { pattern: RegExp; paramNames: string[] } {
    const paramNames: string[] = [];

    // Escape special regex characters to prevent ReDoS and unintended matching
    // We keep ':' for parameter matching
    let regexPath = path.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);

    // Replace parameters like :id with capture groups
    regexPath = regexPath.replaceAll(/:([a-zA-Z_]\w*)/g, (_, paramName) => {
      paramNames.push(paramName);
      return '([^/]+)';
    });

    regexPath = `^${regexPath}$`;
    // SonarQube S2631: The regex is built from developer-defined routes, not user input
    const pattern = new RegExp(regexPath);

    return { pattern, paramNames };
  }
}
