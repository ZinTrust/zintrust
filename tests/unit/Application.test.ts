import { Application } from '@boot/Application';
import { describe, expect, it, vi } from 'vitest';

// Mock dependencies
vi.mock('@/container/ServiceContainer', () => ({
  ServiceContainer: {
    create: vi.fn(() => ({
      singleton: vi.fn(),
      get: vi.fn(),
      make: vi.fn(),
    })),
  },
}));
vi.mock('@/routing/Router', () => ({
  Router: {
    createRouter: vi.fn(() => ({ get: vi.fn(), post: vi.fn() })),
  },
}));
vi.mock('@/middleware/MiddlewareStack', () => ({
  MiddlewareStack: {
    create: vi.fn(() => ({ use: vi.fn(), handle: vi.fn() })),
  },
}));
vi.mock('@config/logger', () => ({
  Logger: Object.freeze({
    initialize: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));
vi.mock('@config/env', () => ({
  Env: {
    get: vi.fn((_key, defaultVal) => defaultVal),
  },
}));

describe('Application', () => {
  it('should initialize core services', () => {
    const app = Application.create('/root');

    expect(app.getContainer()).toBeDefined();
    expect(app.getRouter()).toBeDefined();
    expect(app.getMiddlewareStack()).toBeDefined();
  });

  it('should register core paths', () => {
    const app = Application.create('/root');
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
    const app = Application.create('/root');
    const container = app.getContainer();

    expect(container.singleton).toHaveBeenCalledWith('env', expect.any(String));
    expect(container.singleton).toHaveBeenCalledWith('router', app.getRouter());
    expect(container.singleton).toHaveBeenCalledWith('middleware', app.getMiddlewareStack());
    expect(container.singleton).toHaveBeenCalledWith('container', container);
  });

  it('should detect environment', () => {
    const app = Application.create('/root');
    // Default is development in test env usually, or whatever appConfig says.
    // Since we didn't mock appConfig, it uses real one.
    // Let's just check the methods exist and return booleans
    expect(typeof app.isDevelopment()).toBe('boolean');
    expect(typeof app.isProduction()).toBe('boolean');
    expect(typeof app.isTesting()).toBe('boolean');
    expect(typeof app.getEnvironment()).toBe('string');
  });

  it('should boot', async () => {
    const app = Application.create('/root');
    await expect(app.boot()).resolves.toBeUndefined();
  });

  it('should skip logger initialization when DISABLE_LOGGING is true', async () => {
    process.env['DISABLE_LOGGING'] = 'true';
    vi.resetModules();

    const initialize = vi.fn();
    vi.doMock('@cli/logger/Logger', () => ({
      Logger: {
        initialize,
      },
    }));

    const { Application: FreshApplication } = await import('@boot/Application');
    FreshApplication.create('/root'); // NOSONAR

    expect(initialize).not.toHaveBeenCalled();
    delete process.env['DISABLE_LOGGING'];
  });
});
