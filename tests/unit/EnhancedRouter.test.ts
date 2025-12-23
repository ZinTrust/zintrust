import { EnhancedRouter, type IRouter } from '@routing/EnhancedRouter';
import { beforeEach, describe, expect, it } from 'vitest';

describe('EnhancedRouter Basic Tests', () => {
  let router: IRouter;

  beforeEach(() => {
    router = EnhancedRouter.createRouter();
  });

  it('should register named routes', () => {
    const handler = async (): Promise<void> => {};
    EnhancedRouter.get(router, '/users', handler, 'users.index');
    EnhancedRouter.get(router, '/users/:id', handler, 'users.show');

    const route = EnhancedRouter.getByName(router, 'users.index');
    expect(route?.name).toBe('users.index');
    expect(route?.path).toBe('/users');
  });

  it('should generate URLs for named routes', () => {
    const handler = async (): Promise<void> => {};
    EnhancedRouter.get(router, '/users/:id/posts/:postId', handler, 'posts.show');

    const generated = EnhancedRouter.url(router, 'posts.show', { id: '1', postId: '42' });
    expect(generated).toBe('/users/1/posts/42');
  });

  it('should return null for non-existent route name', () => {
    const generated = EnhancedRouter.url(router, 'nonexistent');
    expect(generated).toBeNull();
  });
});

describe('EnhancedRouter Resource Routes', () => {
  let router: IRouter;

  beforeEach(() => {
    router = EnhancedRouter.createRouter();
  });

  it('should register resource routes', () => {
    const handlers = {
      index: async (): Promise<void> => {},
      create: async (): Promise<void> => {},
      store: async (): Promise<void> => {},
      show: async (): Promise<void> => {},
      edit: async (): Promise<void> => {},
      update: async (): Promise<void> => {},
      destroy: async (): Promise<void> => {},
    };

    EnhancedRouter.resource(router, 'users', handlers);
    const routes = EnhancedRouter.getRoutes(router);

    expect(routes).toHaveLength(7);
    expect(routes.map((r: any) => r.name)).toEqual([
      'users.index',
      'users.create',
      'users.store',
      'users.show',
      'users.edit',
      'users.update',
      'users.destroy',
    ]);
  });
});

describe('EnhancedRouter Route Groups', () => {
  let router: IRouter;

  beforeEach(() => {
    router = EnhancedRouter.createRouter();
  });

  it('should support route groups with prefix', () => {
    const handler = async (): Promise<void> => {};

    EnhancedRouter.group(router, { prefix: '/api' }, (r: IRouter) => {
      EnhancedRouter.get(r, '/users', handler, 'api.users.index');
      EnhancedRouter.get(r, '/users/:id', handler, 'api.users.show');
    });

    const routes = EnhancedRouter.getRoutes(router);
    expect(routes[0].path).toBe('/api/users');
    expect(routes[1].path).toBe('/api/users/:id');
  });

  it('should support route groups with middleware', () => {
    const handler = async (): Promise<void> => {};

    EnhancedRouter.group(router, { middleware: ['auth', 'admin'] }, (r: IRouter) => {
      EnhancedRouter.get(r, '/dashboard', handler);
    });

    const routes = EnhancedRouter.getRoutes(router);
    expect(routes[0].middleware).toEqual(['auth', 'admin']);
  });

  it('should support nested route groups', () => {
    const handler = async (): Promise<void> => {};

    EnhancedRouter.group(router, { prefix: '/api' }, (r: IRouter) => {
      EnhancedRouter.group(r, { prefix: '/v1' }, (r2: IRouter) => {
        EnhancedRouter.get(r2, '/users', handler, 'api.v1.users');
      });
    });

    const routes = EnhancedRouter.getRoutes(router);
    expect(routes[0].path).toBe('/api/v1/users');
  });

  it('should match routes with middleware', () => {
    const handler = async (): Promise<void> => {};

    EnhancedRouter.group(router, { middleware: ['auth'] }, (r: IRouter) => {
      EnhancedRouter.get(r, '/profile', handler);
    });

    const routeMatch = EnhancedRouter.match(router, 'GET', '/profile');
    expect(routeMatch?.middleware).toEqual(['auth']);
  });
});
