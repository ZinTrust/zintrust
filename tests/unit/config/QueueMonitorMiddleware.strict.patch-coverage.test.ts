import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('QUEUE_MONITOR_MIDDLEWARE strict validation (patch coverage)', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env = { ...originalEnv };

    vi.doMock('@config/logger', () => ({
      Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    }));

    vi.doMock('@runtime/StartupConfigFileRegistry', () => ({
      StartupConfigFile: {
        Middleware: 'middleware',
      },
      StartupConfigFileRegistry: {
        get: () => ({
          route: {
            auth: (_req: unknown, _res: unknown, next: () => unknown) => next(),
            jwt: (_req: unknown, _res: unknown, next: () => unknown) => next(),
          },
        }),
      },
    }));
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it('throws when QUEUE_MONITOR_ENABLED=true and unknown middleware keys are configured', async () => {
    process.env['QUEUE_MONITOR_ENABLED'] = 'true';
    process.env['QUEUE_MONITOR_MIDDLEWARE'] = 'auth,unknownKey';

    await expect(
      (async () => {
        const { queueConfig } = await import('@config/queue');
        return queueConfig.monitor;
      })()
    ).rejects.toThrow(/Unknown QUEUE_MONITOR_MIDDLEWARE key\(s\)/);
  });

  it('does not throw when all configured middleware keys are known', async () => {
    process.env['QUEUE_MONITOR_ENABLED'] = 'true';
    process.env['QUEUE_MONITOR_MIDDLEWARE'] = 'auth,jwt';

    const { queueConfig } = await import('@config/queue');
    expect(queueConfig.monitor.middleware).toEqual(['auth', 'jwt']);
  });

  it('accepts supported dynamic middleware keys such as parameterized rate limits', async () => {
    process.env['QUEUE_MONITOR_ENABLED'] = 'true';
    process.env['QUEUE_MONITOR_MIDDLEWARE'] = 'rateLimit:1000:1';

    const { queueConfig } = await import('@config/queue');
    expect(queueConfig.monitor.middleware).toEqual(['rateLimit:1000:1']);
  });
});
