import { EnhancedRouter, type IRouter } from '@/routing/EnhancedRouter';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('EnhancedRouter', () => {
  let router: IRouter;

  beforeEach(() => {
    router = EnhancedRouter.createRouter();
  });

  it('should register and match GET route', () => {
    const handler = vi.fn();
    EnhancedRouter.get(router, '/test', handler);

    const routeMatch = EnhancedRouter.match(router, 'GET', '/test');
    expect(routeMatch).not.toBeNull();
    expect(routeMatch?.handler).toBe(handler);
  });

  it('should register and match POST route', () => {
    const handler = vi.fn();
    EnhancedRouter.post(router, '/test', handler);

    const routeMatch = EnhancedRouter.match(router, 'POST', '/test');
    expect(routeMatch).not.toBeNull();
    expect(routeMatch?.handler).toBe(handler);
  });

  it('should register and match PATCH route', () => {
    const handler = vi.fn();
    EnhancedRouter.patch(router, '/test', handler);

    const routeMatch = EnhancedRouter.match(router, 'PATCH', '/test');
    expect(routeMatch).not.toBeNull();
    expect(routeMatch?.handler).toBe(handler);
  });

  it('should register and match any-method route', () => {
    const handler = vi.fn();
    EnhancedRouter.any(router, '/wild', handler);

    expect(EnhancedRouter.match(router, 'GET', '/wild')?.handler).toBe(handler);
    expect(EnhancedRouter.match(router, 'POST', '/wild')?.handler).toBe(handler);
  });

  it('should match route with parameters', () => {
    const handler = vi.fn();
    EnhancedRouter.get(router, '/users/:id/posts/:postId', handler);

    const routeMatch = EnhancedRouter.match(router, 'GET', '/users/123/posts/456');
    expect(routeMatch).not.toBeNull();
    expect(routeMatch?.params).toEqual({ id: '123', postId: '456' });
  });

  it('should handle route groups with prefix', () => {
    const handler = vi.fn();
    EnhancedRouter.group(router, { prefix: '/api' }, (r: IRouter) => {
      EnhancedRouter.get(r, '/users', handler);
    });

    const routeMatch = EnhancedRouter.match(router, 'GET', '/api/users');
    expect(routeMatch).not.toBeNull();
    expect(routeMatch?.handler).toBe(handler);
  });

  it('should handle route groups with middleware', () => {
    const handler = vi.fn();
    EnhancedRouter.group(router, { middleware: ['auth'] }, (r: IRouter) => {
      EnhancedRouter.get(r, '/dashboard', handler);
    });

    const routeMatch = EnhancedRouter.match(router, 'GET', '/dashboard');
    expect(routeMatch).not.toBeNull();
    expect(routeMatch?.middleware).toContain('auth');
  });

  it('should handle nested groups', () => {
    const handler = vi.fn();
    EnhancedRouter.group(router, { prefix: '/api', middleware: ['api'] }, (r: IRouter) => {
      EnhancedRouter.group(r, { prefix: '/v1', middleware: ['auth'] }, (sub: IRouter) => {
        EnhancedRouter.get(sub, '/users', handler);
      });
    });

    const routeMatch = EnhancedRouter.match(router, 'GET', '/api/v1/users');
    expect(routeMatch).not.toBeNull();
    expect(routeMatch?.middleware).toEqual(['api', 'auth']);
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

    EnhancedRouter.resource(router, 'photos', controller);

    expect(EnhancedRouter.match(router, 'GET', '/photos')?.handler).toBe(controller.index);
    expect(EnhancedRouter.match(router, 'GET', '/photos/create')?.handler).toBe(controller.create);
    expect(EnhancedRouter.match(router, 'POST', '/photos')?.handler).toBe(controller.store);
    expect(EnhancedRouter.match(router, 'GET', '/photos/1')?.handler).toBe(controller.show);
    expect(EnhancedRouter.match(router, 'GET', '/photos/1/edit')?.handler).toBe(controller.edit);
    expect(EnhancedRouter.match(router, 'PUT', '/photos/1')?.handler).toBe(controller.update);
    expect(EnhancedRouter.match(router, 'DELETE', '/photos/1')?.handler).toBe(controller.destroy);
  });

  it('should get route by name', () => {
    const handler = vi.fn();
    EnhancedRouter.get(router, '/test', handler, 'test.route');

    const route = EnhancedRouter.getByName(router, 'test.route');
    expect(route).toBeDefined();
    expect(route?.path).toBe('/test');
  });

  it('should generate URLs for named routes', () => {
    const handler = vi.fn();
    EnhancedRouter.get(router, '/users/:id', handler, 'users.show');

    expect(EnhancedRouter.url(router, 'users.show', { id: '123' })).toBe('/users/123');
    expect(EnhancedRouter.url(router, 'users.show')).toBe('/users/:id');
    expect(EnhancedRouter.url(router, 'missing.route')).toBeNull();
  });

  it('should escape special regex characters in static paths', () => {
    const handler = vi.fn();
    EnhancedRouter.get(router, '/special.+', handler);

    expect(EnhancedRouter.match(router, 'GET', '/special.+')?.handler).toBe(handler);
    expect(EnhancedRouter.match(router, 'GET', '/specialX+')?.handler).toBeUndefined();
  });

  it('should expose registered routes via getRoutes()', () => {
    const handler = vi.fn();
    EnhancedRouter.get(router, '/a', handler);
    EnhancedRouter.post(router, '/b', handler);

    const routes = EnhancedRouter.getRoutes(router);
    expect(routes).toHaveLength(2);
    expect(routes[0].path).toBe('/a');
    expect(routes[1].path).toBe('/b');
  });

  it('should handle defensive case when regex exec returns null', () => {
    const handler = vi.fn();
    EnhancedRouter.get(router, '/defensive', handler);

    type ExecTestPattern = {
      test: (value: string) => boolean;
      exec: (value: string) => RegExpExecArray | null;
    };

    type RouteWithPattern = {
      pattern: ExecTestPattern;
    };

    const routes = EnhancedRouter.getRoutes(router) as unknown as RouteWithPattern[];
    routes[0].pattern = {
      test: () => true,
      exec: () => null,
    };

    expect(EnhancedRouter.match(router, 'GET', '/defensive')).toBeNull();
  });

  it('should return null for non-matching route', () => {
    EnhancedRouter.get(router, '/test', vi.fn());
    expect(EnhancedRouter.match(router, 'GET', '/other')).toBeNull();
    expect(EnhancedRouter.match(router, 'POST', '/test')).toBeNull();
  });
});
