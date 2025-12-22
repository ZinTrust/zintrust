import { Router } from '@routing/EnhancedRouter';
import { beforeEach, describe, expect, it } from 'vitest';

describe('EnhancedRouter Basic Tests', () => {
  let router: Router;

  beforeEach(() => {
    router = new Router();
  });

  it('should register named routes', () => {
    const handler = async (): Promise<void> => {};
    router.get('/users', handler, 'users.index');
    router.get('/users/:id', handler, 'users.show');

    const route = router.getByName('users.index');
    expect(route?.name).toBe('users.index');
    expect(route?.path).toBe('/users');
  });

  it('should generate URLs for named routes', () => {
    const handler = async (): Promise<void> => {};
    router.get('/users/:id/posts/:postId', handler, 'posts.show');

    const url = router.url('posts.show', { id: '1', postId: '42' });
    expect(url).toBe('/users/1/posts/42');
  });

  it('should return null for non-existent route name', () => {
    const url = router.url('nonexistent');
    expect(url).toBeNull();
  });
});

describe('EnhancedRouter Resource Routes', () => {
  let router: Router;

  beforeEach(() => {
    router = new Router();
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

    router.resource('users', handlers);
    const routes = router.getRoutes();

    expect(routes).toHaveLength(7);
    expect(routes.map((r) => r.name)).toEqual([
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
  let router: Router;

  beforeEach(() => {
    router = new Router();
  });

  it('should support route groups with prefix', () => {
    const handler = async (): Promise<void> => {};

    router.group({ prefix: '/api' }, (r) => {
      r.get('/users', handler, 'api.users.index');
      r.get('/users/:id', handler, 'api.users.show');
    });

    const routes = router.getRoutes();
    expect(routes[0].path).toBe('/api/users');
    expect(routes[1].path).toBe('/api/users/:id');
  });

  it('should support route groups with middleware', () => {
    const handler = async (): Promise<void> => {};

    router.group({ middleware: ['auth', 'admin'] }, (r) => {
      r.get('/dashboard', handler);
    });

    const routes = router.getRoutes();
    expect(routes[0].middleware).toEqual(['auth', 'admin']);
  });

  it('should support nested route groups', () => {
    const handler = async (): Promise<void> => {};

    router.group({ prefix: '/api' }, (r) => {
      r.group({ prefix: '/v1' }, (r2) => {
        r2.get('/users', handler, 'api.v1.users');
      });
    });

    const routes = router.getRoutes();
    expect(routes[0].path).toBe('/api/v1/users');
  });

  it('should match routes with middleware', () => {
    const handler = async (): Promise<void> => {};

    router.group({ middleware: ['auth'] }, (r) => {
      r.get('/profile', handler);
    });

    const match = router.match('GET', '/profile');
    expect(match?.middleware).toEqual(['auth']);
  });
});
