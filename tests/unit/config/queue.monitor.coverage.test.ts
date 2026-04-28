/* eslint-disable max-nested-callbacks -- mock-heavy coverage tests intentionally nest factory callbacks */

import { afterEach, describe, expect, it, vi } from 'vitest';

describe('queue monitor config coverage', () => {
  afterEach(() => {
    vi.doUnmock('@runtime/StartupConfigFileRegistry');
    vi.restoreAllMocks();
    vi.resetModules();
    delete process.env['QUEUE_MONITOR_ENABLED'];
    delete process.env['QUEUE_MONITOR_MIDDLEWARE'];
  });

  it('treats non-object middleware route overrides as having no configured route keys', async () => {
    process.env['QUEUE_MONITOR_ENABLED'] = 'true';
    process.env['QUEUE_MONITOR_MIDDLEWARE'] = 'rateLimit:10:1';

    vi.doMock('@runtime/StartupConfigFileRegistry', () => ({
      StartupConfigFile: {
        Queue: 'config/queue.ts',
        Middleware: 'config/middleware.ts',
      },
      StartupConfigFileRegistry: {
        get: vi.fn(() => ({ route: [] })),
        clear: vi.fn(),
        has: vi.fn(() => false),
        isPreloaded: vi.fn(() => false),
        preload: vi.fn(async () => undefined),
      },
      default: {
        get: vi.fn(() => ({ route: [] })),
        clear: vi.fn(),
        has: vi.fn(() => false),
        isPreloaded: vi.fn(() => false),
        preload: vi.fn(async () => undefined),
      },
    }));

    const queueModule = await import('@/config/queue?invalid-route-config-shape');

    expect(queueModule.queueConfig.monitor.enabled).toBe(true);
    expect(queueModule.queueConfig.monitor.middleware).toEqual(['rateLimit:10:1']);
  });
});
