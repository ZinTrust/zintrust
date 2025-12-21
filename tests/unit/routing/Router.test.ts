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
});
