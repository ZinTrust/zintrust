import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock environment and heavy modules before importing Application
vi.mock('@config/logger', () => ({
  Logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/config', () => ({
  appConfig: {
    environment: 'test',
    isDevelopment: () => false,
    isProduction: () => false,
    isTesting: () => true,
  },
  cacheConfig: {},
  databaseConfig: {
    connections: {
      default: { driver: 'sqlite', database: ':memory:' },
    },
    default: 'default',
  },
  queueConfig: { default: 'inmemory' },
  storageConfig: { drivers: { local: { type: 'local' } }, default: 'local' },
}));

vi.mock('@/container/ServiceContainer', () => ({
  ServiceContainer: { create: vi.fn(() => ({ singleton: vi.fn() })) },
}));

vi.mock('@/routing/Router', () => ({
  Router: { createRouter: vi.fn(() => ({ register: vi.fn() })) },
}));
vi.mock('@/middleware/MiddlewareStack', () => ({
  MiddlewareStack: { create: vi.fn(() => ({ use: vi.fn() })) },
}));

vi.mock('@/runtime/StartupConfigFileRegistry', () => ({
  StartupConfigFileRegistry: { preload: vi.fn(async () => {}), get: vi.fn(() => undefined) },
  StartupConfigFile: {
    Middleware: 'Middleware',
    Cache: 'Cache',
    Database: 'Database',
    Queue: 'Queue',
    Storage: 'Storage',
    Mail: 'Mail',
    Broadcast: 'Broadcast',
    Notification: 'Notification',
  },
}));
vi.mock('@/health/StartupHealthChecks', () => ({
  StartupHealthChecks: { assertHealthy: vi.fn(async () => {}) },
}));
vi.mock('@config/features', () => ({ FeatureFlags: { initialize: vi.fn() } }));
vi.mock('@config/StartupConfigValidator', () => ({
  StartupConfigValidator: { assertValid: vi.fn() },
}));
vi.mock('@orm/Database', () => ({ useDatabase: vi.fn(), resetDatabase: vi.fn() }));

import Application from '@/boot/Application';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('patch coverage: Application lifecycle', () => {
  it('boot and shutdown toggle booted state', async () => {
    const app = Application.create('');
    expect(app.getBasePath()).toBe('');
    expect(app.isBooted()).toBe(false);

    await app.boot();
    expect(app.isBooted()).toBe(true);

    await app.shutdown();
    expect(app.isBooted()).toBe(false);
  });

  it('environment helpers reflect mocked config', () => {
    const app = Application.create('');
    expect(app.getEnvironment()).toBe('test');
    expect(app.isTesting()).toBe(true);
    expect(app.isDevelopment()).toBe(false);
  });

  it('covers getBasePath functionality', () => {
    const app = Application.create('/test/path');
    expect(app.getBasePath()).toBe('/test/path');
  });

  it('covers getContainer functionality', () => {
    const app = Application.create('');
    const container = app.getContainer();
    expect(container).toBeDefined();
  });
});
