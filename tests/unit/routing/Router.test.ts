import { Router, type IRouter } from '@routing/Router';
import { beforeEach, describe, expect, it } from 'vitest';

describe('Router', (): void => {
  let router: IRouter;

  beforeEach((): void => {
    router = Router.createRouter();
  });

  it('should register and match a GET route', (): void => {
    const handler = async (): Promise<void> => {};
    Router.get(router, '/users', handler);

    const routes = Router.getRoutes(router);
    expect(routes).toHaveLength(1);
    expect(routes[0].method).toBe('GET');
    expect(routes[0].path).toBe('/users');

    const routeMatch = Router.match(router, 'GET', '/users');
    expect(routeMatch).not.toBeNull();
    expect(routeMatch?.handler).toBe(handler);
    expect(routeMatch?.params).toEqual({});
  });

  it('should match route with path parameters', (): void => {
    const handler = async (): Promise<void> => {};
    Router.get(router, '/users/:id', handler);

    const routeMatch = Router.match(router, 'GET', '/users/123');
    expect(routeMatch).not.toBeNull();
    expect(routeMatch?.params).toEqual({ id: '123' });
  });

  it('should return null for non-matching route', (): void => {
    const handler = async (): Promise<void> => {};
    Router.get(router, '/users', handler);

    const routeMatch = Router.match(router, 'GET', '/posts');
    expect(routeMatch).toBeNull();
  });

  it('should return null when method does not match', (): void => {
    const handler = async (): Promise<void> => {};
    Router.get(router, '/users', handler);

    const routeMatch = Router.match(router, 'POST', '/users');
    expect(routeMatch).toBeNull();
  });

  it('should support multiple path parameters', (): void => {
    const handler = async (): Promise<void> => {};
    Router.get(router, '/users/:userId/posts/:postId', handler);

    const routeMatch = Router.match(router, 'GET', '/users/1/posts/2');
    expect(routeMatch?.params).toEqual({ userId: '1', postId: '2' });
  });

  it('should register POST, PUT, PATCH, DELETE routes', (): void => {
    const handler = async (): Promise<void> => {};
    Router.post(router, '/users', handler);
    Router.put(router, '/users/:id', handler);
    Router.patch(router, '/users/:id', handler);
    Router.del(router, '/users/:id', handler);

    const routes = Router.getRoutes(router);
    expect(routes).toHaveLength(4);
    expect(routes[0].method).toBe('POST');
    expect(routes[1].method).toBe('PUT');
    expect(routes[2].method).toBe('PATCH');
    expect(routes[3].method).toBe('DELETE');
  });

  it('should register routes for all methods via any()', (): void => {
    const handler = async (): Promise<void> => {};
    Router.any(router, '/ping', handler);

    const routes = Router.getRoutes(router);
    expect(routes).toHaveLength(5);

    const methods = routes.map((route) => route.method);
    expect(methods).toEqual(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);

    const routeMatch = Router.match(router, 'PATCH', '/ping');
    expect(routeMatch?.handler).toBe(handler);
  });

  it('should match wildcard method routes (method = *)', (): void => {
    const handler = async (): Promise<void> => {};

    type TestRouteShape = {
      method: string;
      path: string;
      pattern: RegExp;
      handler: (req: unknown, res: unknown) => Promise<void> | void;
      paramNames: string[];
    };

    const routes = Router.getRoutes(router) as unknown as TestRouteShape[];
    routes.push({
      method: '*',
      path: '/wild',
      pattern: /^\/wild$/,
      handler,
      paramNames: [],
    });

    const routeMatch = Router.match(router, 'POST', '/wild');
    expect(routeMatch).not.toBeNull();
    expect(routeMatch?.handler).toBe(handler);
    expect(routeMatch?.params).toEqual({});
  });

  it('should support group() with prefix normalization', (): void => {
    const handler = async (): Promise<void> => {};

    Router.group(router, ' api/ ', (scoped) => {
      Router.get(scoped, 'users', handler);
      Router.get(scoped, '/', handler);
    });

    const routes = Router.getRoutes(router);
    const paths = routes.map((r) => r.path).sort((a, b) => a.localeCompare(b));
    expect(paths).toEqual(['/api', '/api/users']);
  });

  it('should support nested group() prefixes', (): void => {
    const handler = async (): Promise<void> => {};

    Router.group(router, '/api', (api) => {
      Router.group(api, 'v1/', (v1) => {
        Router.get(v1, '/ping', handler);
      });
    });

    const routeMatch = Router.match(router, 'GET', '/api/v1/ping');
    expect(routeMatch?.handler).toBe(handler);
  });

  it('should register RESTful routes via resource()', (): void => {
    const handler = async (): Promise<void> => {};

    Router.group(router, '/api', (api) => {
      Router.resource(api, '/posts/', {
        index: handler,
        store: handler,
        show: handler,
        update: handler,
        destroy: handler,
      });
    });

    const routes = Router.getRoutes(router);
    expect(routes).toHaveLength(6);

    expect(routes.some((r) => r.method === 'GET' && r.path.startsWith('/api/posts'))).toBe(true);
    expect(routes.some((r) => r.method === 'POST' && r.path.startsWith('/api/posts'))).toBe(true);
    expect(routes.some((r) => r.method === 'PUT' && r.path.includes(':id'))).toBe(true);
    expect(routes.some((r) => r.method === 'PATCH' && r.path.includes(':id'))).toBe(true);
    expect(routes.some((r) => r.method === 'DELETE' && r.path.includes(':id'))).toBe(true);

    const match = Router.match(router, 'GET', '/api/posts/123');
    expect(match?.handler).toBe(handler);
    expect(match?.params).toEqual({ id: '123' });
  });
});
