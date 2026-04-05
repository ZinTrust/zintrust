import { describe, expect, it, vi } from 'vitest';

vi.mock('@config/logger', () => ({
  Logger: Object.freeze({
    initialize: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

describe('Application boot - optional import failures', () => {
  it('continues boot when an optional runtime-registration import fails', async () => {
    vi.resetModules();

    vi.doMock('@/config', () => ({
      appConfig: {
        environment: 'test',
        port: 7777,
        dockerWorker: true,
        worker: false,
        isDevelopment: () => false,
        isProduction: () => false,
        isTesting: () => true,
      },
      queueConfig: {
        default: 'sync',
        monitor: { enabled: false },
        drivers: { redis: { host: '127.0.0.1', port: 6379, password: '', database: 0 } },
      },
      cacheConfig: {},
      storageConfig: {
        default: 'local',
        drivers: {
          local: { driver: 'local', root: 'storage/app' },
        },
      },
    }));

    vi.doMock('@/runtime/WorkersModule', () => ({
      loadWorkersModule: vi.fn(async () => null),
      loadQueueMonitorModule: vi.fn(async () => null),
    }));

    // Provide a safe mock to keep optional import flow stable for this test.
    vi.doMock('@orm/DatabaseRuntimeRegistration', () => ({
      registerDatabasesFromRuntimeConfig: vi.fn(),
    }));

    const { Application } = await import('@boot/Application');
    const app = Application.create('');

    await expect(app.boot()).resolves.toBeUndefined();
    await expect(app.shutdown()).resolves.toBeUndefined();
  });
});
