/**
 * RouteGenerator - Generate route files
 * Creates route definitions with middleware and parameters
 */

import { FileGenerator } from '@cli/scaffolding/FileGenerator';
import { Logger } from '@config/logger';
import path from 'node:path';

export type RouteMethod = 'get' | 'post' | 'put' | 'patch' | 'delete' | 'resource';

export interface RouteDefinition {
  method: RouteMethod;
  path: string;
  controller: string;
  action?: string;
  middleware?: string[];
  params?: string[];
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
export async function generateRoutes(options: RouteOptions): Promise<RouteGeneratorResult> {
  const validation = validateOptions(options);
  if (!validation.valid) {
    return {
      success: false,
      routeFile: '',
      routeCount: 0,
      message: `Validation failed: ${validation.errors.join(', ')}`,
    };
  }

  try {
    const routeContent = buildRouteWrapper(options);
    const groupName = options.groupName ?? 'routes';
    const routeFile = path.join(options.routesPath, `${groupName}.ts`);

    const created = FileGenerator.writeFile(routeFile, routeContent);
    if (!created) {
      return {
        success: false,
        routeFile,
        routeCount: 0,
        message: `Failed to create route file`,
      };
    }

    Logger.info(`✅ Generated routes: ${routeFile} (${options.routes.length} routes)`);

    return {
      success: true,
      routeFile,
      routeCount: options.routes.length,
      message: `Routes created successfully`,
    };
  } catch (error) {
    Logger.error('Route generation failed', error);
    return {
      success: false,
      routeFile: '',
      routeCount: 0,
      message: `Error: ${(error as Error).message}`,
    };
  }
}

/**
 * Build route wrapper TypeScript code
 */
function buildRouteWrapper(options: RouteOptions): string {
  const imports = buildImports(options);
  const routeRegistration = buildRouteRegistration(options);

  return `/**
 * Routes
 * Auto-generated route definitions
 */

${imports}

export function registerRoutes(router: Router): void {
${routeRegistration}
}
`;
}

/**
 * Build import statements
 */
function buildImports(options: RouteOptions): string {
  const imports: string[] = ['import { Router } from "@routing/Router";'];

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

/**
 * Build route registration code
 */
function buildRouteRegistration(options: RouteOptions): string {
  let code = '';

  // Add group if prefix or middleware provided
  if (options.prefix !== undefined || options.middleware !== undefined) {
    code += `  router.group({`;

    const groupOptions: string[] = [];
    if (options.prefix !== undefined) {
      groupOptions.push(`    prefix: '${options.prefix}'`);
    }
    if (options.middleware !== undefined && options.middleware.length > 0) {
      const middleware = options.middleware.map((m) => `'${m}'`).join(', ');
      groupOptions.push(`    middleware: [${middleware}]`);
    }

    code += groupOptions.join(',\n') + '\n';
    code += `  }, (r) => {\n`;

    // Add routes inside group
    for (const route of options.routes) {
      code += buildRouteCode(route, 'r');
    }

    code += `  });\n`;
  } else {
    // Add routes directly
    for (const route of options.routes) {
      code += buildRouteCode(route, 'router');
    }
  }

  return code;
}

/**
 * Build single route code
 */
function buildRouteCode(route: RouteDefinition, router: string): string {
  if (route.method === 'resource') {
    return buildResourceRoute(route, router);
  } else {
    return buildMethodRoute(route, router);
  }
}

/**
 * Build standard method route (GET, POST, etc.)
 */
function buildMethodRoute(route: RouteDefinition, router: string): string {
  const method = route.method;
  const path = route.path;
  const controller = route.controller;
  const action = route.action ?? 'handle';
  const middleware =
    route.middleware === undefined
      ? ''
      : ((): string => {
          const middlewareList = route.middleware.map((m) => `'${m}'`).join(', ');
          return `, { middleware: [${middlewareList}] }`;
        })();

  return `    ${router}.${method}('${path}', [${controller}, '${action}']${middleware});\n`;
}

/**
 * Build resource route (RESTful CRUD)
 */
function buildResourceRoute(route: RouteDefinition, router: string): string {
  const path = route.path;
  const controller = route.controller;
  const middleware =
    route.middleware === undefined
      ? ''
      : ((): string => {
          const middlewareList = route.middleware.map((m) => `'${m}'`).join(', ');
          return `, { middleware: [${middlewareList}] }`;
        })();

  return `    ${router}.resource('${path}', ${controller}${middleware});\n`;
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
