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
};

export const createRouter = (): IRouter => ({
  routes: <Route[]>[],
  prefix: '',
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
  routes: Route[],
  method: string,
  path: string,
  handler: RouteHandler
): void => {
  const { pattern, paramNames } = pathToRegex(path);
  routes.push({
    method,
    path,
    pattern,
    handler,
    paramNames,
  });
};

/**
 * Match a request to a route
 */
const matchRoute = (routes: Route[], method: string, path: string): RouteMatch | null => {
  for (const route of routes) {
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
});

const group = (router: IRouter, prefix: string, callback: RouteGroupCallback): void => {
  callback(scopeRouter(router, prefix));
};

const resource = (router: IRouter, path: string, controller: ResourceController): void => {
  const base = joinPaths(router.prefix, path);
  const withId = `${base.endsWith('/') ? base.slice(0, -1) : base}/:id`;

  if (controller.index) registerRoute(router.routes, 'GET', base, controller.index);
  if (controller.store) registerRoute(router.routes, 'POST', base, controller.store);
  if (controller.show) registerRoute(router.routes, 'GET', withId, controller.show);

  if (controller.update) {
    registerRoute(router.routes, 'PUT', withId, controller.update);
    registerRoute(router.routes, 'PATCH', withId, controller.update);
  }

  if (controller.destroy) registerRoute(router.routes, 'DELETE', withId, controller.destroy);
};

const get = (router: IRouter, path: string, handler: RouteHandler): void => {
  registerRoute(router.routes, 'GET', joinPaths(router.prefix, path), handler);
};

const post = (router: IRouter, path: string, handler: RouteHandler): void => {
  registerRoute(router.routes, 'POST', joinPaths(router.prefix, path), handler);
};

const put = (router: IRouter, path: string, handler: RouteHandler): void => {
  registerRoute(router.routes, 'PUT', joinPaths(router.prefix, path), handler);
};

const patch = (router: IRouter, path: string, handler: RouteHandler): void => {
  registerRoute(router.routes, 'PATCH', joinPaths(router.prefix, path), handler);
};

const del = (router: IRouter, path: string, handler: RouteHandler): void => {
  registerRoute(router.routes, 'DELETE', joinPaths(router.prefix, path), handler);
};

const any = (router: IRouter, path: string, handler: RouteHandler): void => {
  const fullPath = joinPaths(router.prefix, path);
  ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].forEach((method) => {
    registerRoute(router.routes, method, fullPath, handler);
  });
};

const match = (router: IRouter, method: string, path: string): RouteMatch | null =>
  matchRoute(router.routes, method, path);

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
