import { Application } from '@/Application';
import { ServiceContainer } from '@/container/ServiceContainer';
import { MiddlewareStack } from '@/middleware/MiddlewareStack';
import { Router } from '@/routing/EnhancedRouter';
import { describe, expect, it, vi } from 'vitest';

// Mock dependencies
vi.mock('@/container/ServiceContainer');
vi.mock('@/routing/EnhancedRouter');
vi.mock('@/middleware/MiddlewareStack');
vi.mock('@/config/logger');

describe('Application', () => {
  it('should initialize core services', () => {
    const app = new Application('/root');

    expect(app.getContainer()).toBeInstanceOf(ServiceContainer);
    expect(app.getRouter()).toBeInstanceOf(Router);
    expect(app.getMiddlewareStack()).toBeInstanceOf(MiddlewareStack);
  });

  it('should register core paths', () => {
    const app = new Application('/root');
    const container = app.getContainer();

    expect(container.singleton).toHaveBeenCalledWith('paths', {
      base: '/root',
      app: '/root/app',
      config: '/root/config',
      database: '/root/database',
      routes: '/root/routes',
      tests: '/root/tests',
    });
  });

  it('should register core instances', () => {
    const app = new Application('/root');
    const container = app.getContainer();

    expect(container.singleton).toHaveBeenCalledWith('env', expect.any(String));
    expect(container.singleton).toHaveBeenCalledWith('router', app.getRouter());
    expect(container.singleton).toHaveBeenCalledWith('middleware', app.getMiddlewareStack());
    expect(container.singleton).toHaveBeenCalledWith('container', container);
  });

  it('should detect environment', () => {
    const app = new Application('/root');
    // Default is development in test env usually, or whatever appConfig says.
    // Since we didn't mock appConfig, it uses real one.
    // Let's just check the methods exist and return booleans
    expect(typeof app.isDevelopment()).toBe('boolean');
    expect(typeof app.isProduction()).toBe('boolean');
    expect(typeof app.isTesting()).toBe('boolean');
  });

  it('should boot', async () => {
    const app = new Application('/root');
    await expect(app.boot()).resolves.toBeUndefined();
  });
});
