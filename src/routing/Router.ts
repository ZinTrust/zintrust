import { IRequest } from '@http/Request';
import { IResponse } from '@http/Response';

/**
 * Router - HTTP Routing Engine
 * Matches incoming requests to route handlers
 */

export type RouteHandler = (req: IRequest, res: IResponse) => Promise<void> | void;

export interface RouteMatch {
  handler: RouteHandler;
  params: Record<string, string>;
}

export interface Route {
  method: string;
  path: string;
  pattern: RegExp;
  handler: RouteHandler;
  paramNames: string[];
}

export type RouteGroupCallback = (router: IRouter) => void;

export interface ResourceController {
  index?: RouteHandler;
  show?: RouteHandler;
  store?: RouteHandler;
  update?: RouteHandler;
  destroy?: RouteHandler;
}

export type IRouter = {
  routes: Route[];
  prefix: string;
  routeIndex: Map<string, Route[]>;
};

export const createRouter = (): IRouter => ({
  routes: <Route[]>[],
  prefix: '',
  routeIndex: new Map<string, Route[]>(),
});

/**
 * Router - HTTP Routing Engine
 * Matches incoming requests to route handlers
 */
/**
 * Convert a path pattern to a regex
 * Example: /users/:id/posts/:postId -> /users/([^/]+)/posts/([^/]+)
 */
const pathToRegex = (path: string): { pattern: RegExp; paramNames: string[] } => {
  const paramNames: string[] = [];
  let regexPath = path.replaceAll(/:([a-zA-Z_]\w*)/g, (_, paramName) => {
    paramNames.push(paramName);
    return '([^/]+)';
  });

  regexPath = `^${regexPath}$`;
  const pattern = new RegExp(regexPath);

  return { pattern, paramNames };
};

/**
 * Register a route
 */
const registerRoute = (
  router: IRouter,
  method: string,
  path: string,
  handler: RouteHandler
): void => {
  const { pattern, paramNames } = pathToRegex(path);
  const route: Route = {
    method,
    path,
    pattern,
    handler,
    paramNames,
  };

  router.routes.push(route);

  // Index by method for faster lookup
  if (!router.routeIndex.has(method)) {
    router.routeIndex.set(method, []);
  }
  router.routeIndex.get(method)?.push(route);
};

/**
 * Extract parameters from a matching route
 */
const getRouteMatch = (route: Route, path: string): RouteMatch | null => {
  const match = route.pattern.exec(path);
  if (!match) return null;

  const params: Record<string, string> = {};
  route.paramNames.forEach((paramName, index) => {
    params[paramName] = match[index + 1];
  });

  return {
    handler: route.handler,
    params,
  };
};

/**
 * Fallback linear search for manually added routes
 */
const findInFallback = (router: IRouter, method: string, path: string): RouteMatch | null => {
  for (const route of router.routes) {
    // Skip if already checked via index
    if (router.routeIndex !== undefined) {
      const methodRoutes = router.routeIndex.get(route.method);
      if (methodRoutes?.includes(route) ?? false) continue;
    }

    if (route.method !== method && route.method !== '*') continue;

    const match = getRouteMatch(route, path);
    if (match) return match;
  }
  return null;
};

/**
 * Match a request to a route
 */
const matchRoute = (router: IRouter, method: string, path: string): RouteMatch | null => {
  // Try fast lookup first
  if (router.routeIndex !== undefined) {
    const candidates = [
      ...(router.routeIndex.get(method) ?? []),
      ...(router.routeIndex.get('*') ?? []),
    ];

    for (const route of candidates) {
      const match = getRouteMatch(route, path);
      if (match) return match;
    }
  }

  // Fallback to linear search for manually added routes or if index is missing
  return findInFallback(router, method, path);
};

const stripTrailingSlashes = (value: string): string => {
  let end = value.length;
  while (end > 0 && value.codePointAt(end - 1) === 47) {
    end--;
  }
  return value.slice(0, end);
};

const normalizePrefix = (prefix: string): string => {
  const trimmed = prefix.trim();
  if (trimmed === '' || trimmed === '/') return '';
  const withoutTrailing = stripTrailingSlashes(trimmed);
  return withoutTrailing.startsWith('/') ? withoutTrailing : `/${withoutTrailing}`;
};

const normalizePath = (path: string): string => {
  const trimmed = path.trim();
  if (trimmed === '') return '/';
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
};

const joinPaths = (prefix: string, path: string): string => {
  const pfx = normalizePrefix(prefix);
  const pth = normalizePath(path);

  if (pfx === '') return pth;
  if (pth === '/') return pfx || '/';
  return `${pfx}${pth}`;
};

const scopeRouter = (router: IRouter, prefix: string): IRouter => ({
  routes: router.routes,
  prefix: joinPaths(router.prefix, prefix),
  routeIndex: router.routeIndex,
});

const group = (router: IRouter, prefix: string, callback: RouteGroupCallback): void => {
  callback(scopeRouter(router, prefix));
};

const resource = (router: IRouter, path: string, controller: ResourceController): void => {
  const base = joinPaths(router.prefix, path);
  const withId = `${base.endsWith('/') ? base.slice(0, -1) : base}/:id`;

  if (controller.index) registerRoute(router, 'GET', base, controller.index);
  if (controller.store) registerRoute(router, 'POST', base, controller.store);
  if (controller.show) registerRoute(router, 'GET', withId, controller.show);

  if (controller.update) {
    registerRoute(router, 'PUT', withId, controller.update);
    registerRoute(router, 'PATCH', withId, controller.update);
  }

  if (controller.destroy) registerRoute(router, 'DELETE', withId, controller.destroy);
};

const get = (router: IRouter, path: string, handler: RouteHandler): void => {
  registerRoute(router, 'GET', joinPaths(router.prefix, path), handler);
};

const post = (router: IRouter, path: string, handler: RouteHandler): void => {
  registerRoute(router, 'POST', joinPaths(router.prefix, path), handler);
};

const put = (router: IRouter, path: string, handler: RouteHandler): void => {
  registerRoute(router, 'PUT', joinPaths(router.prefix, path), handler);
};

const patch = (router: IRouter, path: string, handler: RouteHandler): void => {
  registerRoute(router, 'PATCH', joinPaths(router.prefix, path), handler);
};

const del = (router: IRouter, path: string, handler: RouteHandler): void => {
  registerRoute(router, 'DELETE', joinPaths(router.prefix, path), handler);
};

const any = (router: IRouter, path: string, handler: RouteHandler): void => {
  const fullPath = joinPaths(router.prefix, path);
  ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].forEach((method) => {
    registerRoute(router, method, fullPath, handler);
  });
};

const match = (router: IRouter, method: string, path: string): RouteMatch | null =>
  matchRoute(router, method, path);

const getRoutes = (router: IRouter): Route[] => router.routes;

/**
 * Router - Sealed namespace for HTTP routing
 * All operations grouped in frozen namespace to prevent mutation
 */
export const Router = Object.freeze({
  createRouter,
  scopeRouter,
  group,
  resource,
  get,
  post,
  put,
  patch,
  del,
  any,
  match,
  getRoutes,
});

export default Router;
