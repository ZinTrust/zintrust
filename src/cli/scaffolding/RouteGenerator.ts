/**
 * RouteGenerator - Generate route files
 * Creates route definitions with middleware and parameters
 */

import { FileGenerator } from '@cli/scaffolding/FileGenerator';
import { Logger } from '@config/logger';
import * as path from '@node-singletons/path';

export type RouteMethod = 'get' | 'post' | 'put' | 'patch' | 'delete' | 'resource';

export interface RouteDefinition {
  method: RouteMethod;
  path: string;
  controller: string;
  action?: string;
  middleware?: string[];
  params?: string[];
}

// Escape characters that can cause issues when embedding JSON.stringify output
// into generated JavaScript source (e.g., inside <script> tags).
const unsafeCharMap: { [ch: string]: string } = {
  '<': '\\u003C',
  '>': '\\u003E',
  '/': '\\u002F',
  '\\': '\\\\',
  '\b': '\\b',
  '\f': '\\f',
  '\n': '\\n',
  '\r': '\\r',
  '\t': '\\t',
  '\0': '\\0',
  '\u2028': '\\u2028',
  '\u2029': '\\u2029',
};

function escapeUnsafeChars(str: string): string {
  return str.replace(/[<>/\\\b\f\n\r\t\0\u2028\u2029]/g, (ch) => unsafeCharMap[ch] ?? ch);
}

export interface RouteOptions {
  routesPath: string; // Path to routes/
  groupName?: string; // e.g., 'api', 'admin'
  prefix?: string; // URL prefix (e.g., '/api/v1')
  middleware?: string[]; // Global middleware
  routes: RouteDefinition[];
  namespace?: string; // Controller namespace
}

export interface RouteGeneratorResult {
  success: boolean;
  routeFile: string;
  routeCount: number;
  message: string;
}

/**
 * Validate route options
 */
export function validateOptions(options: RouteOptions): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (options.routesPath === '' || !FileGenerator.directoryExists(options.routesPath)) {
    errors.push(`Routes directory does not exist: ${options.routesPath}`);
  }

  if (options.routes.length === 0) {
    errors.push(`No routes provided`);
  }

  const validMethods: RouteMethod[] = ['get', 'post', 'put', 'patch', 'delete', 'resource'];
  const invalidRoutes = options.routes.filter((r) => !validMethods.includes(r.method));
  if (invalidRoutes.length > 0) {
    errors.push(`Invalid route methods. Supported: ${validMethods.join(', ')}`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Generate route file
 */
// eslint-disable-next-line @typescript-eslint/promise-function-async
export function generateRoutes(options: RouteOptions): Promise<RouteGeneratorResult> {
  const validation = validateOptions(options);
  if (!validation.valid) {
    return Promise.resolve({
      success: false,
      routeFile: '',
      routeCount: 0,
      message: `Validation failed: ${validation.errors.join(', ')}`,
    });
  }

  try {
    const routeContent = buildRouteWrapper(options);
    const groupName = options.groupName ?? 'routes';
    const routeFile = path.join(options.routesPath, `${groupName}.ts`);

    const created = FileGenerator.writeFile(routeFile, routeContent);
    if (!created) {
      return Promise.resolve({
        success: false,
        routeFile,
        routeCount: 0,
        message: `Failed to create route file`,
      });
    }

    Logger.info(`✅ Generated routes: ${routeFile} (${options.routes.length} routes)`);

    return Promise.resolve({
      success: true,
      routeFile,
      routeCount: options.routes.length,
      message: `Routes created successfully`,
    });
  } catch (error) {
    Logger.error('Route generation failed', error);
    const message = error instanceof Error ? error.message : String(error);
    return Promise.resolve({
      success: false,
      routeFile: '',
      routeCount: 0,
      message: `Error: ${message}`,
    });
  }
}

/**
 * Build route wrapper TypeScript code
 */
function buildRouteWrapper(options: RouteOptions): string {
  const imports = buildImports(options);
  const controllerInstances = buildControllerInstances(options);
  const routeRegistration = buildRouteRegistration(options);

  return `/**
 * Routes
 * Auto-generated route definitions
 */

${imports}

export function registerRoutes(router: IRouter): void {
${controllerInstances}
${routeRegistration}
}
`;
}

/**
 * Build import statements
 */
function buildImports(options: RouteOptions): string {
  const imports: string[] = ["import { Router, type IRouter } from '@zintrust/core';"];

  // Collect unique controllers
  const controllers = new Set<string>();
  for (const route of options.routes) {
    controllers.add(route.controller);
  }

  // Add controller imports
  for (const controller of controllers) {
    imports.push(`import { ${controller} } from '@app/Controllers/${controller}';`);
  }

  return imports.join('\n');
}

function toControllerVar(controllerName: string): string {
  if (controllerName.length === 0) return 'controller';
  return `${controllerName[0].toLowerCase()}${controllerName.slice(1)}`;
}

function toTag(controllerName: string): string {
  const trimmed = controllerName.endsWith('Controller')
    ? controllerName.slice(0, -'Controller'.length)
    : controllerName;
  return trimmed === '' ? 'General' : trimmed;
}

function buildControllerInstances(options: RouteOptions): string {
  const controllers = new Set<string>();
  for (const route of options.routes) {
    controllers.add(route.controller);
  }

  let code = '';
  for (const controller of controllers) {
    const varName = toControllerVar(controller);
    code += `  const ${varName} = typeof ${controller}.create === 'function' ? ${controller}.create() : ${controller};\n`;
  }

  return code;
}

/**
 * Build route registration code
 */
function buildRouteRegistration(options: RouteOptions): string {
  let code = '';

  const groupMiddleware = options.middleware ?? [];
  const groupMiddlewareList = groupMiddleware.map((m) => `'${m}'`).join(', ');

  if (options.prefix !== undefined && options.prefix.trim() !== '') {
    code += `  Router.group(router, '${options.prefix}', (r) => {\n`;
    for (const route of options.routes) {
      code += buildRouteCode(route, 'r', groupMiddlewareList);
    }
    code += `  });\n`;
    return code;
  }

  for (const route of options.routes) {
    code += buildRouteCode(route, 'router', groupMiddlewareList);
  }

  return code;
}

/**
 * Build single route code
 */
function buildRouteCode(
  route: RouteDefinition,
  router: string,
  groupMiddlewareList: string
): string {
  if (route.method === 'resource') {
    return buildResourceRoute(route, router, groupMiddlewareList);
  } else {
    return buildMethodRoute(route, router, groupMiddlewareList);
  }
}

/**
 * Build standard method route (GET, POST, etc.)
 */
function buildMethodRoute(
  route: RouteDefinition,
  router: string,
  groupMiddlewareList: string
): string {
  const method = route.method === 'delete' ? 'del' : route.method;
  const routePath = route.path;
  const controller = route.controller;
  const action = route.action ?? 'handle';

  const tag = toTag(controller);
  const summary = `${method.toUpperCase()} ${routePath}`;
  const controllerVar = toControllerVar(controller);

  const localMiddlewareList = (route.middleware ?? []).map((m) => `'${m}'`).join(', ');
  const hasGroup = groupMiddlewareList.trim() !== '';
  const hasLocal = localMiddlewareList.trim() !== '';

  const middlewareProp =
    hasGroup || hasLocal
      ? `middleware: [${[hasGroup ? groupMiddlewareList : '', hasLocal ? localMiddlewareList : '']
          .filter((v) => v.trim() !== '')
          .join(', ')}]`
      : '';

  const metaProp = `meta: { summary: ${escapeUnsafeChars(JSON.stringify(summary))}, tags: [${escapeUnsafeChars(
    JSON.stringify(tag)
  )}] }`;
  const options = `{ ${[middlewareProp, metaProp].filter((v) => v !== '').join(', ')} }`;

  return `  Router.${method}(${router}, '${routePath}', (req, res) => ${controllerVar}.${action}(req, res), ${options});\n`;
}

/**
 * Build resource route (RESTful CRUD)
 */
function buildResourceRoute(
  route: RouteDefinition,
  router: string,
  groupMiddlewareList: string
): string {
  const routePath = route.path;
  const controller = route.controller;

  const tag = toTag(controller);
  const controllerVar = toControllerVar(controller);

  const localMiddlewareList = (route.middleware ?? []).map((m) => `'${m}'`).join(', ');
  const hasGroup = groupMiddlewareList.trim() !== '';
  const hasLocal = localMiddlewareList.trim() !== '';

  const middlewareProp =
    hasGroup || hasLocal
      ? `middleware: [${[hasGroup ? groupMiddlewareList : '', hasLocal ? localMiddlewareList : '']
          .filter((v) => v.trim() !== '')
          .join(', ')}]`
      : '';

  const resourceMeta = (action: string, routePattern: string): string =>
    `meta: { summary: ${escapeUnsafeChars(
      JSON.stringify(action.toUpperCase() + ' ' + routePattern)
    )}, tags: [${escapeUnsafeChars(JSON.stringify(tag))}] }`;
  const pathId = routePath + '/:id';
  const optsParts = [
    middlewareProp,
    `index: { ${resourceMeta('GET', routePath)} }`,
    `store: { ${resourceMeta('POST', routePath)} }`,
    `show: { ${resourceMeta('GET', pathId)} }`,
    `update: { ${resourceMeta('PUT', pathId)} }`,
    `destroy: { ${resourceMeta('DELETE', pathId)} }`,
  ].filter((v) => v !== '');

  const options = `{ ${optsParts.join(', ')} }`;

  return `  Router.resource(${router}, '${routePath}', ${controllerVar}, ${options});\n`;
}

/**
 * Generate common API routes (User CRUD example)
 */
export function getUserApiRoutes(): RouteDefinition[] {
  return [
    {
      method: 'get',
      path: '/users',
      controller: 'UserController',
      action: 'index',
      middleware: ['auth'],
    },
    {
      method: 'post',
      path: '/users',
      controller: 'UserController',
      action: 'store',
      middleware: ['auth'],
    },
    {
      method: 'get',
      path: '/users/:id',
      controller: 'UserController',
      action: 'show',
      middleware: ['auth'],
    },
    {
      method: 'put',
      path: '/users/:id',
      controller: 'UserController',
      action: 'update',
      middleware: ['auth'],
    },
    {
      method: 'delete',
      path: '/users/:id',
      controller: 'UserController',
      action: 'destroy',
      middleware: ['auth'],
    },
  ];
}

/**
 * Generate common auth routes
 */
export function getAuthRoutes(): RouteDefinition[] {
  return [
    {
      method: 'post',
      path: '/auth/login',
      controller: 'AuthController',
      action: 'login',
    },
    {
      method: 'post',
      path: '/auth/register',
      controller: 'AuthController',
      action: 'register',
    },
    {
      method: 'post',
      path: '/auth/logout',
      controller: 'AuthController',
      action: 'logout',
      middleware: ['auth'],
    },
    {
      method: 'post',
      path: '/auth/refresh',
      controller: 'AuthController',
      action: 'refresh',
      middleware: ['auth'],
    },
  ];
}

/**
 * Generate common admin routes
 */
export function getAdminRoutes(): RouteDefinition[] {
  return [
    {
      method: 'get',
      path: '/dashboard',
      controller: 'AdminController',
      action: 'dashboard',
      middleware: ['auth', 'admin'],
    },
    {
      method: 'get',
      path: '/users',
      controller: 'AdminController',
      action: 'users',
      middleware: ['auth', 'admin'],
    },
    {
      method: 'get',
      path: '/analytics',
      controller: 'AdminController',
      action: 'analytics',
      middleware: ['auth', 'admin'],
    },
    {
      method: 'get',
      path: '/logs',
      controller: 'AdminController',
      action: 'logs',
      middleware: ['auth', 'admin'],
    },
  ];
}

/**
 * Get common HTTP methods
 */
export function getCommonMethods(): RouteMethod[] {
  return ['get', 'post', 'put', 'patch', 'delete', 'resource'];
}

/**
 * RouteGenerator creates route definitions
 */
export const RouteGenerator = Object.freeze({
  validateOptions,
  generateRoutes,
  getUserApiRoutes,
  getAuthRoutes,
  getAdminRoutes,
  getCommonMethods,
});
