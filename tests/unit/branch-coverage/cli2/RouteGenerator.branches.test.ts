import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  directoryExists: vi.fn((_path: string) => true),
  writeFile: vi.fn(() => true),
  info: vi.fn(),
  error: vi.fn(),
}));

vi.mock('@cli/scaffolding/FileGenerator', () => ({
  FileGenerator: {
    directoryExists: (...args: unknown[]) => (mocks.directoryExists as (...a: any[]) => any)(...args),
    writeFile: (...args: unknown[]) => (mocks.writeFile as (...a: any[]) => any)(...args),
  },
}));

vi.mock('@config/logger', () => ({
  Logger: { info: mocks.info, error: mocks.error, warn: vi.fn(), debug: vi.fn() },
}));

import {
  RouteGenerator,
  type RouteDefinition,
  type RouteOptions,
} from '@cli/scaffolding/RouteGenerator';

const options = (routes: RouteDefinition[], overrides: Partial<RouteOptions> = {}): RouteOptions => ({
  routesPath: '/project/routes',
  routes,
  ...overrides,
});

const route = (overrides: Partial<RouteDefinition> = {}): RouteDefinition => ({
  method: 'get',
  path: '/example',
  controller: 'ExampleController',
  ...overrides,
});

const generated = (): string => String(mocks.writeFile.mock.calls[0]?.[1] ?? '');

describe('RouteGenerator uncovered branches', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.directoryExists.mockReturnValue(true);
    mocks.writeFile.mockReturnValue(true);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('rejects invalid paths, empty route lists, and unsupported methods', async () => {
    const emptyPath = await RouteGenerator.generateRoutes(options([route()], { routesPath: '' }));
    expect(emptyPath.success).toBe(false);
    expect(emptyPath.message).toContain('Routes directory does not exist');

    const noRoutes = await RouteGenerator.generateRoutes(options([]));
    expect(noRoutes.message).toContain('No routes provided');

    const badMethod = await RouteGenerator.generateRoutes(options([route({ method: 'options' as never })]));
    expect(badMethod.message).toContain('Invalid route methods');
    expect(mocks.writeFile).not.toHaveBeenCalled();
  });

  it('generates a default group name, controller variable, action, and General tag', async () => {
    const result = await RouteGenerator.generateRoutes(options([route({ controller: 'Controller' })]));

    expect(result.success).toBe(true);
    expect(result.routeFile).toBe('/project/routes/routes.ts');
    expect(generated()).toContain('Router.get(router, \'/example\', (req: IRequest, res: IResponse) => controller.handle(req, res)');
    expect(generated()).toContain('tags: ["General"]');
  });

  it('uses an explicit prefix, group middleware, and an empty controller name', async () => {
    const result = await RouteGenerator.generateRoutes(
      options(
        [route({ controller: '', middleware: ['local'] })],
        { groupName: 'api', prefix: ' /v1 ', middleware: ['auth', 'admin'] }
      )
    );

    expect(result.success).toBe(true);
    expect(result.routeFile).toBe('/project/routes/api.ts');
    expect(generated()).toContain("Router.group(router, ' /v1 ', (r) => {");
    expect(generated()).toContain("middleware: ['auth', 'admin', 'local']");
    expect(generated()).toContain('const controller = typeof .create');
  });

  it('supports group-only middleware without local middleware', async () => {
    const result = await RouteGenerator.generateRoutes(
      options([route()], { middleware: ['auth'] })
    );

    expect(result.success).toBe(true);
    expect(generated()).toContain("middleware: ['auth']");
    expect(generated()).not.toContain("'auth', ''");
  });

  it('maps delete to del and uses an explicit action with local-only middleware', async () => {
    const result = await RouteGenerator.generateRoutes(
      options([route({ method: 'delete', action: 'destroy', middleware: ['auth'] })])
    );

    expect(result.success).toBe(true);
    expect(generated()).toContain('Router.del(router');
    expect(generated()).toContain('middleware: [\'auth\']');
    expect(generated()).toContain('exampleController.destroy(req, res)');
  });

  it('generates resource routes with tags derived from controller names', async () => {
    const result = await RouteGenerator.generateRoutes(
      options([route({ method: 'resource', path: '/users', controller: 'UserController' })])
    );

    expect(result.success).toBe(true);
    expect(generated()).toContain('Router.resource(router, \'/users\', userController');
    expect(generated()).toContain('tags: ["User"]');
  });

  it('reports a failed file write', async () => {
    mocks.writeFile.mockReturnValue(false);

    const result = await RouteGenerator.generateRoutes(options([route()]));

    expect(result.success).toBe(false);
    expect(result.message).toBe('Failed to create route file');
    expect(result.routeFile).toBe('/project/routes/routes.ts');
  });

  it('formats Error and non-Error generation failures', async () => {
    const errorRoute = route({ middleware: 'not-an-array' as never });
    const errorResult = await RouteGenerator.generateRoutes(options([errorRoute]));
    expect(errorResult.success).toBe(false);
    expect(errorResult.message).toMatch(/^Error: /);

    const throwingRoute = route();
    Object.defineProperty(throwingRoute, 'path', {
      get() {
        throw 'plain failure';
      },
    });
    const stringResult = await RouteGenerator.generateRoutes(options([throwingRoute]));
    expect(stringResult.success).toBe(false);
    expect(stringResult.message).toBe('Error: plain failure');
    expect(mocks.error).toHaveBeenCalled();
  });

  it('exposes the bundled route presets and supported methods', () => {
    expect(RouteGenerator.getCommonMethods()).toEqual([
      'get',
      'post',
      'put',
      'patch',
      'delete',
      'resource',
    ]);
    expect(RouteGenerator.getUserApiRoutes()).toHaveLength(5);
    expect(RouteGenerator.getAuthRoutes()).toHaveLength(4);
    expect(RouteGenerator.getAdminRoutes()).toHaveLength(4);
  });
});
