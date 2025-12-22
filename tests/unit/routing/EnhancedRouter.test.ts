import { Router } from '@/routing/EnhancedRouter';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('EnhancedRouter', () => {
  let router: Router;

  beforeEach(() => {
    router = new Router();
  });

  it('should register and match GET route', () => {
    const handler = vi.fn();
    router.get('/test', handler);

    const match = router.match('GET', '/test');
    expect(match).not.toBeNull();
    expect(match?.handler).toBe(handler);
  });

  it('should register and match POST route', () => {
    const handler = vi.fn();
    router.post('/test', handler);

    const match = router.match('POST', '/test');
    expect(match).not.toBeNull();
    expect(match?.handler).toBe(handler);
  });

  it('should register and match PATCH route', () => {
    const handler = vi.fn();
    router.patch('/test', handler);

    const match = router.match('PATCH', '/test');
    expect(match).not.toBeNull();
    expect(match?.handler).toBe(handler);
  });

  it('should register and match any-method route', () => {
    const handler = vi.fn();
    router.any('/wild', handler);

    expect(router.match('GET', '/wild')?.handler).toBe(handler);
    expect(router.match('POST', '/wild')?.handler).toBe(handler);
  });

  it('should match route with parameters', () => {
    const handler = vi.fn();
    router.get('/users/:id/posts/:postId', handler);

    const match = router.match('GET', '/users/123/posts/456');
    expect(match).not.toBeNull();
    expect(match?.params).toEqual({ id: '123', postId: '456' });
  });

  it('should handle route groups with prefix', () => {
    const handler = vi.fn();
    router.group({ prefix: '/api' }, (r) => {
      r.get('/users', handler);
    });

    const match = router.match('GET', '/api/users');
    expect(match).not.toBeNull();
    expect(match?.handler).toBe(handler);
  });

  it('should handle route groups with middleware', () => {
    const handler = vi.fn();
    router.group({ middleware: ['auth'] }, (r) => {
      r.get('/dashboard', handler);
    });

    const match = router.match('GET', '/dashboard');
    expect(match).not.toBeNull();
    expect(match?.middleware).toContain('auth');
  });

  it('should handle nested groups', () => {
    const handler = vi.fn();
    router.group({ prefix: '/api', middleware: ['api'] }, (r) => {
      r.group({ prefix: '/v1', middleware: ['auth'] }, (sub) => {
        sub.get('/users', handler);
      });
    });

    const match = router.match('GET', '/api/v1/users');
    expect(match).not.toBeNull();
    expect(match?.middleware).toEqual(['api', 'auth']);
  });

  it('should register resource routes', () => {
    const controller = {
      index: vi.fn(),
      create: vi.fn(),
      store: vi.fn(),
      show: vi.fn(),
      edit: vi.fn(),
      update: vi.fn(),
      destroy: vi.fn(),
    };

    router.resource('photos', controller);

    expect(router.match('GET', '/photos')?.handler).toBe(controller.index);
    expect(router.match('GET', '/photos/create')?.handler).toBe(controller.create);
    expect(router.match('POST', '/photos')?.handler).toBe(controller.store);
    expect(router.match('GET', '/photos/1')?.handler).toBe(controller.show);
    expect(router.match('GET', '/photos/1/edit')?.handler).toBe(controller.edit);
    expect(router.match('PUT', '/photos/1')?.handler).toBe(controller.update);
    expect(router.match('DELETE', '/photos/1')?.handler).toBe(controller.destroy);
  });

  it('should get route by name', () => {
    const handler = vi.fn();
    router.get('/test', handler, 'test.route');

    const route = router.getByName('test.route');
    expect(route).toBeDefined();
    expect(route?.path).toBe('/test');
  });

  it('should generate URLs for named routes', () => {
    const handler = vi.fn();
    router.get('/users/:id', handler, 'users.show');

    expect(router.url('users.show', { id: '123' })).toBe('/users/123');
    expect(router.url('users.show')).toBe('/users/:id');
    expect(router.url('missing.route')).toBeNull();
  });

  it('should escape special regex characters in static paths', () => {
    const handler = vi.fn();
    router.get('/special.+', handler);

    expect(router.match('GET', '/special.+')?.handler).toBe(handler);
    expect(router.match('GET', '/specialX+')?.handler).toBeUndefined();
  });

  it('should expose registered routes via getRoutes()', () => {
    const handler = vi.fn();
    router.get('/a', handler);
    router.post('/b', handler);

    const routes = router.getRoutes();
    expect(routes).toHaveLength(2);
    expect(routes[0].path).toBe('/a');
    expect(routes[1].path).toBe('/b');
  });

  it('should handle defensive case when regex exec returns null', () => {
    const handler = vi.fn();
    router.get('/defensive', handler);

    type ExecTestPattern = {
      test: (value: string) => boolean;
      exec: (value: string) => RegExpExecArray | null;
    };

    type RouteWithPattern = {
      pattern: ExecTestPattern;
    };

    const routes = router.getRoutes() as unknown as RouteWithPattern[];
    routes[0].pattern = {
      test: () => true,
      exec: () => null,
    };

    expect(router.match('GET', '/defensive')).toBeNull();
  });

  it('should return null for non-matching route', () => {
    router.get('/test', vi.fn());
    expect(router.match('GET', '/other')).toBeNull();
    expect(router.match('POST', '/test')).toBeNull();
  });
});
