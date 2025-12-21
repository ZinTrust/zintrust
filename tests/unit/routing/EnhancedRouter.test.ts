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

  it('should return null for non-matching route', () => {
    router.get('/test', vi.fn());
    expect(router.match('GET', '/other')).toBeNull();
    expect(router.match('POST', '/test')).toBeNull();
  });
});
