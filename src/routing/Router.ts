import type { IRequest } from '@http/Request';
import type { IResponse } from '@http/Response';
import {
  RouteRegistry,
  normalizeRouteMeta,
  type RouteMeta,
  type RouteMetaInput,
} from '@routing/RouteRegistry';

/**
 * Router - HTTP Routing Engine
 * Matches incoming requests to route handlers
 */

export type RouteHandler = (req: IRequest, res: IResponse) => Promise<void> | void;

export type RouteOptions<MiddlewareName extends string = string> = {
  middleware?: ReadonlyArray<MiddlewareName>;
  meta?: RouteMetaInput;
};

export interface RouteMatch {
  handler: RouteHandler;
  params: Record<string, string>;
  middleware?: string[];
  meta?: RouteMeta;
  routePath?: string;
}

export interface Route {
  method: string;
  path: string;
  pattern: RegExp;
  handler: RouteHandler;
  paramNames: string[];
  middleware?: string[];
  meta?: RouteMeta;
}

export type RouteGroupCallback = (router: IRouter) => void;

export type GroupOptions<MiddlewareName extends string = string> = {
  middleware?: ReadonlyArray<MiddlewareName>;
};

export interface ResourceController {
  index?: RouteHandler;
  show?: RouteHandler;
  store?: RouteHandler;
  update?: RouteHandler;
  destroy?: RouteHandler;
}

export type ResourceOptions<MiddlewareName extends string = string> =
  RouteOptions<MiddlewareName> & {
    index?: RouteOptions<MiddlewareName>;
    show?: RouteOptions<MiddlewareName>;
    store?: RouteOptions<MiddlewareName>;
    update?: RouteOptions<MiddlewareName>;
    destroy?: RouteOptions<MiddlewareName>;
  };

export type IRouter = {
  routes: Route[];
  prefix: string;
  routeIndex: Map<string, Route[]>;
  inheritedMiddleware?: ReadonlyArray<string>;
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
  // Supports:
  // - :id     => single path segment (no slashes)
  // - :path*  => greedy match (may include slashes)
  let regexPath = path.replaceAll(
    /:([a-zA-Z_]\w*)(\*)?/g,
    (_full, paramName: string, star: unknown) => {
      paramNames.push(paramName);
      const isGreedy = star === '*';
      return isGreedy ? '(.+)' : '([^/]+)';
    }
  );

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
  handler: RouteHandler,
  options?: RouteOptions
): void => {
  const { pattern, paramNames } = pathToRegex(path);

  // Merge inherited middleware with route-specific middleware
  let routeMiddleware: string[] | undefined;

  if (router.inheritedMiddleware && router.inheritedMiddleware.length > 0) {
    const routeSpecificMiddleware = Array.isArray(options?.middleware)
      ? (options?.middleware as string[])
      : [];
    routeMiddleware = [...router.inheritedMiddleware, ...routeSpecificMiddleware];
  } else {
    const hasRouteSpecificMiddleware = Array.isArray(options?.middleware);
    if (hasRouteSpecificMiddleware) {
      routeMiddleware = options?.middleware as string[];
    }
  }

  const route: Route = {
    method,
    path,
    pattern,
    handler,
    paramNames,
    middleware: routeMiddleware,
    meta: normalizeRouteMeta(options?.meta),
  };

  router.routes.push(route);

  RouteRegistry.record({
    method,
    path,
    middleware: route.middleware,
    meta: route.meta,
  });

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
    middleware: route.middleware,
    meta: route.meta,
    routePath: route.path,
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

const scopeRouter = (
  router: IRouter,
  prefix: string,
  inheritedMiddleware?: ReadonlyArray<string>
): IRouter => ({
  routes: router.routes,
  prefix: joinPaths(router.prefix, prefix),
  routeIndex: router.routeIndex,
  inheritedMiddleware,
});

const group = <M extends string = string>(
  router: IRouter,
  prefix: string,
  callback: RouteGroupCallback,
  options?: GroupOptions<M>
): void => {
  callback(scopeRouter(router, prefix, options?.middleware));
};

function buildResourcePaths(prefix: string, path: string): { base: string; withId: string } {
  const base = joinPaths(prefix, path);
  const withId = `${base.endsWith('/') ? base.slice(0, -1) : base}/:id`;
  return { base, withId };
}

function resolveResourceDefaultOptions<M extends string = string>(
  options?: ResourceOptions<M>
): RouteOptions<M> | undefined {
  return options?.middleware ? { middleware: options.middleware } : undefined;
}

function registerResourceIndex(
  router: IRouter,
  base: string,
  controller: ResourceController,
  options: ResourceOptions | undefined,
  defaultOptions: RouteOptions | undefined
): void {
  if (!controller.index) return;
  registerRoute(router, 'GET', base, controller.index, options?.index ?? defaultOptions);
}

function registerResourceStore(
  router: IRouter,
  base: string,
  controller: ResourceController,
  options: ResourceOptions | undefined,
  defaultOptions: RouteOptions | undefined
): void {
  if (!controller.store) return;
  registerRoute(router, 'POST', base, controller.store, options?.store ?? defaultOptions);
}

function registerResourceShow(
  router: IRouter,
  withId: string,
  controller: ResourceController,
  options: ResourceOptions | undefined,
  defaultOptions: RouteOptions | undefined
): void {
  if (!controller.show) return;
  registerRoute(router, 'GET', withId, controller.show, options?.show ?? defaultOptions);
}

function registerResourceUpdate(
  router: IRouter,
  withId: string,
  controller: ResourceController,
  options: ResourceOptions | undefined,
  defaultOptions: RouteOptions | undefined
): void {
  if (!controller.update) return;

  const updateOptions = options?.update ?? defaultOptions;
  registerRoute(router, 'PUT', withId, controller.update, updateOptions);
  registerRoute(router, 'PATCH', withId, controller.update, updateOptions);
}

function registerResourceDestroy(
  router: IRouter,
  withId: string,
  controller: ResourceController,
  options: ResourceOptions | undefined,
  defaultOptions: RouteOptions | undefined
): void {
  if (!controller.destroy) return;
  registerRoute(router, 'DELETE', withId, controller.destroy, options?.destroy ?? defaultOptions);
}

const resource = <M extends string = string>(
  router: IRouter,
  path: string,
  controller: ResourceController,
  options?: ResourceOptions<M>
): void => {
  const { base, withId } = buildResourcePaths(router.prefix, path);
  const defaultOptions = resolveResourceDefaultOptions(options);

  registerResourceIndex(router, base, controller, options, defaultOptions);
  registerResourceStore(router, base, controller, options, defaultOptions);
  registerResourceShow(router, withId, controller, options, defaultOptions);
  registerResourceUpdate(router, withId, controller, options, defaultOptions);
  registerResourceDestroy(router, withId, controller, options, defaultOptions);
};

const get = <M extends string = string>(
  router: IRouter,
  path: string,
  handler: RouteHandler,
  options?: RouteOptions<M>
): void => {
  registerRoute(router, 'GET', joinPaths(router.prefix, path), handler, options);
};

const post = <M extends string = string>(
  router: IRouter,
  path: string,
  handler: RouteHandler,
  options?: RouteOptions<M>
): void => {
  registerRoute(router, 'POST', joinPaths(router.prefix, path), handler, options);
};

const put = <M extends string = string>(
  router: IRouter,
  path: string,
  handler: RouteHandler,
  options?: RouteOptions<M>
): void => {
  registerRoute(router, 'PUT', joinPaths(router.prefix, path), handler, options);
};

const patch = <M extends string = string>(
  router: IRouter,
  path: string,
  handler: RouteHandler,
  options?: RouteOptions<M>
): void => {
  registerRoute(router, 'PATCH', joinPaths(router.prefix, path), handler, options);
};

const del = <M extends string = string>(
  router: IRouter,
  path: string,
  handler: RouteHandler,
  options?: RouteOptions<M>
): void => {
  registerRoute(router, 'DELETE', joinPaths(router.prefix, path), handler, options);
};

const any = <M extends string = string>(
  router: IRouter,
  path: string,
  handler: RouteHandler,
  options?: RouteOptions<M>
): void => {
  const fullPath = joinPaths(router.prefix, path);
  ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].forEach((method) => {
    registerRoute(router, method, fullPath, handler, options);
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
