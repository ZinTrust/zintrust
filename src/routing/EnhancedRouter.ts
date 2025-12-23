import { IRequest } from '@http/Request';
import { IResponse } from '@http/Response';

/**
 * Enhanced Router with Route Groups and Resource Routes
 * Declarative routing API with intuitive syntax
 */

export type RouteHandler = (req: IRequest, res: IResponse) => Promise<void> | void;
export type Middleware = (
  req: IRequest,
  res: IResponse,
  next: () => Promise<void>
) => Promise<void>;

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

export interface IRouter {
  routes: RegisteredRoute[];
  nameMap: Map<string, RegisteredRoute>;
  currentGroup?: { prefix: string; middleware: string[] };
}

const createRouter = (): IRouter => ({
  routes: <RegisteredRoute[]>[],
  nameMap: new Map<string, RegisteredRoute>(),
  currentGroup: undefined,
});

const get = (
  router: IRouter,
  path: string,
  handler: RouteHandler,
  name?: string
): RegisteredRoute =>
  registerRoute(router.routes, router.nameMap, router.currentGroup, 'GET', path, handler, name);

const post = (
  router: IRouter,
  path: string,
  handler: RouteHandler,
  name?: string
): RegisteredRoute =>
  registerRoute(router.routes, router.nameMap, router.currentGroup, 'POST', path, handler, name);

const put = (
  router: IRouter,
  path: string,
  handler: RouteHandler,
  name?: string
): RegisteredRoute =>
  registerRoute(router.routes, router.nameMap, router.currentGroup, 'PUT', path, handler, name);

const patch = (
  router: IRouter,
  path: string,
  handler: RouteHandler,
  name?: string
): RegisteredRoute =>
  registerRoute(router.routes, router.nameMap, router.currentGroup, 'PATCH', path, handler, name);

const del = (
  router: IRouter,
  path: string,
  handler: RouteHandler,
  name?: string
): RegisteredRoute =>
  registerRoute(router.routes, router.nameMap, router.currentGroup, 'DELETE', path, handler, name);

const any = (
  router: IRouter,
  path: string,
  handler: RouteHandler,
  name?: string
): RegisteredRoute =>
  registerRoute(router.routes, router.nameMap, router.currentGroup, '*', path, handler, name);

const resource = (
  router: IRouter,
  resourceName: string,
  controller: {
    index: RouteHandler;
    create: RouteHandler;
    store: RouteHandler;
    show: RouteHandler;
    edit: RouteHandler;
    update: RouteHandler;
    destroy: RouteHandler;
  }
): void => {
  get(router, `/${resourceName}`, controller.index, `${resourceName}.index`);
  get(router, `/${resourceName}/create`, controller.create, `${resourceName}.create`);
  post(router, `/${resourceName}`, controller.store, `${resourceName}.store`);
  get(router, `/${resourceName}/:id`, controller.show, `${resourceName}.show`);
  get(router, `/${resourceName}/:id/edit`, controller.edit, `${resourceName}.edit`);
  put(router, `/${resourceName}/:id`, controller.update, `${resourceName}.update`);
  del(router, `/${resourceName}/:id`, controller.destroy, `${resourceName}.destroy`);
};

const group = (
  router: IRouter,
  options: { prefix?: string; middleware?: string[] },
  callback: (router: IRouter) => void
): void => {
  const prevGroup = router.currentGroup;
  router.currentGroup = {
    prefix: (prevGroup?.prefix ?? '') + (options.prefix ?? ''),
    middleware: [...(prevGroup?.middleware ?? []), ...(options.middleware ?? [])],
  };
  callback(router);
  router.currentGroup = prevGroup;
};

const match = (router: IRouter, method: string, path: string): RouteMatch | null =>
  matchRoute(router.routes, method, path);

const getByName = (router: IRouter, name: string): RegisteredRoute | undefined =>
  router.nameMap.get(name);

const url = (router: IRouter, name: string, params: Record<string, string> = {}): string | null =>
  generateUrl(router.nameMap, name, params);

const getRoutes = (router: IRouter): RegisteredRoute[] => router.routes;

/**
 * Enhanced Router - Sealed namespace for HTTP routing
 * Declarative API with route groups, resource routes, and named routes
 */
export const EnhancedRouter = Object.freeze({
  createRouter,
  get,
  post,
  put,
  patch,
  del,
  any,
  resource,
  group,
  match,
  getByName,
  url,
  getRoutes,
});

export default EnhancedRouter;
function pathToRegex(path: string): { pattern: RegExp; paramNames: string[] } {
  const paramNames: string[] = [];
  let regexPath = path.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
  regexPath = regexPath.replaceAll(/:([a-zA-Z_]\w*)/g, (_, paramName) => {
    paramNames.push(paramName);
    return '([^/]+)';
  });
  regexPath = `^${regexPath}$`;
  return { pattern: new RegExp(regexPath), paramNames };
}

/**
 * Internal route registration
 */
function registerRoute(
  routes: RegisteredRoute[],
  nameMap: Map<string, RegisteredRoute>,
  currentGroup: { prefix: string; middleware: string[] } | undefined,
  method: string,
  path: string,
  handler: RouteHandler,
  name?: string
): RegisteredRoute {
  let fullPath = path;
  let middleware: string[] = [];

  if (currentGroup !== undefined) {
    fullPath = currentGroup.prefix + path;
    middleware = [...currentGroup.middleware];
  }

  const { pattern, paramNames } = pathToRegex(fullPath);

  const route: RegisteredRoute = {
    method,
    path: fullPath,
    name,
    pattern,
    handler,
    paramNames,
    middleware,
  };

  routes.push(route);
  if (name !== undefined) {
    nameMap.set(name, route);
  }

  return route;
}

/**
 * Match route against method and path
 */
function matchRoute(routes: RegisteredRoute[], method: string, path: string): RouteMatch | null {
  for (const route of routes) {
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
 * Generate URL from route name and params
 */
function generateUrl(
  nameMap: Map<string, RegisteredRoute>,
  name: string,
  params: Record<string, string>
): string | null {
  const route = nameMap.get(name);
  if (route === undefined) return null;
  let url = route.path;
  for (const [key, value] of Object.entries(params)) {
    url = url.replaceAll(`:${key}`, value);
  }
  return url;
}
