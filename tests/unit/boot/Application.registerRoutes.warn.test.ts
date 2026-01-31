import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('Application.registerRoutes warn branch', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('logs a warning when no app routes and framework routes unavailable', async () => {
    const warnSpy = vi.fn();
    // Minimal logger mock
    vi.doMock('@config/logger', () => ({
      Logger: { warn: warnSpy, info: vi.fn(), error: vi.fn() },
    }));

    // Prevent heavy startup checks and dynamic imports from failing the boot flow
    vi.doMock('@config/StartupConfigValidator', () => ({
      StartupConfigValidator: { assertValid: () => {} },
    }));
    vi.doMock('@/health/StartupHealthChecks', () => ({
      StartupHealthChecks: { assertHealthy: async () => {} },
    }));
    vi.doMock('@runtime/StartupConfigFileRegistry', () => ({
      StartupConfigFileRegistry: { preload: async () => {}, get: () => undefined },
      StartupConfigFile: {
        Middleware: 0,
        Cache: 1,
        Database: 2,
        Queue: 3,
        Storage: 4,
        Mail: 5,
        Broadcast: 6,
        Notification: 7,
      },
    }));

    // Ensure core routes registration exists (no-op)
    vi.doMock('@core-routes/CoreRoutes', () => ({ registerCoreRoutes: () => {} }));

    // Ensure pathToFileURL behaves sensibly so dynamic imports attempt and fail
    vi.doMock('@node-singletons/url', () => ({
      pathToFileURL: (p: string) => ({ href: `file://${p}` }),
    }));

    // Import Application after mocks set up
    const { Application } = await import('@/boot/Application');

    const basePath = '/does/not/exist';
    const app = Application.create(basePath);

    // Run boot — registerRoutes should hit the warning branch when no app or framework routes
    await app.boot();

    expect(warnSpy).toHaveBeenCalledWith(
      'No app routes found and framework routes are unavailable. Ensure routes/api.ts exists in the project.'
    );
  });
});
