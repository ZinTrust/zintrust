import { Router } from '@routing/Router';
import { beforeEach, describe, expect, it } from 'vitest';

describe('Router', (): void => {
  let router: Router;

  beforeEach((): void => {
    router = new Router();
  });

  it('should register and match a GET route', (): void => {
    const handler = async (): Promise<void> => {};
    router.get('/users', handler);

    const routes = router.getRoutes();
    expect(routes).toHaveLength(1);
    expect(routes[0].method).toBe('GET');
    expect(routes[0].path).toBe('/users');

    const match = router.match('GET', '/users');
    expect(match).not.toBeNull();
    expect(match?.handler).toBe(handler);
    expect(match?.params).toEqual({});
  });

  it('should match route with path parameters', (): void => {
    const handler = async (): Promise<void> => {};
    router.get('/users/:id', handler);

    const match = router.match('GET', '/users/123');
    expect(match).not.toBeNull();
    expect(match?.params).toEqual({ id: '123' });
  });

  it('should return null for non-matching route', (): void => {
    const handler = async (): Promise<void> => {};
    router.get('/users', handler);

    const match = router.match('GET', '/posts');
    expect(match).toBeNull();
  });

  it('should return null when method does not match', (): void => {
    const handler = async (): Promise<void> => {};
    router.get('/users', handler);

    const match = router.match('POST', '/users');
    expect(match).toBeNull();
  });

  it('should support multiple path parameters', (): void => {
    const handler = async (): Promise<void> => {};
    router.get('/users/:userId/posts/:postId', handler);

    const match = router.match('GET', '/users/1/posts/2');
    expect(match?.params).toEqual({ userId: '1', postId: '2' });
  });

  it('should register POST, PUT, PATCH, DELETE routes', (): void => {
    const handler = async (): Promise<void> => {};
    router.post('/users', handler);
    router.put('/users/:id', handler);
    router.patch('/users/:id', handler);
    router.delete('/users/:id', handler);

    const routes = router.getRoutes();
    expect(routes).toHaveLength(4);
    expect(routes[0].method).toBe('POST');
    expect(routes[1].method).toBe('PUT');
    expect(routes[2].method).toBe('PATCH');
    expect(routes[3].method).toBe('DELETE');
  });

  it('should register routes for all methods via any()', (): void => {
    const handler = async (): Promise<void> => {};
    router.any('/ping', handler);

    const routes = router.getRoutes();
    expect(routes).toHaveLength(5);

    const methods = routes.map((route) => route.method);
    expect(methods).toEqual(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);

    const match = router.match('PATCH', '/ping');
    expect(match?.handler).toBe(handler);
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

    const routes = router.getRoutes() as unknown as TestRouteShape[];
    routes.push({
      method: '*',
      path: '/wild',
      pattern: /^\/wild$/,
      handler,
      paramNames: [],
    });

    const match = router.match('POST', '/wild');
    expect(match).not.toBeNull();
    expect(match?.handler).toBe(handler);
    expect(match?.params).toEqual({});
  });
});
