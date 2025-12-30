import { describe, expect, it, vi } from 'vitest';

describe('StartupHealthChecks', () => {
  const originalEnv = process.env;

  it('returns ok when disabled', async () => {
    vi.resetModules();
    process.env = { ...originalEnv, STARTUP_HEALTH_CHECKS: 'false', NODE_ENV: 'production' };

    const { StartupHealthChecks } = await import('@/health/StartupHealthChecks');
    const report = await StartupHealthChecks.run();

    expect(report.ok).toBe(true);
    expect(report.checks.length).toBeGreaterThan(0);
  });

  it('reports failure when enabled and secrets validation fails', async () => {
    vi.resetModules();
    process.env = {
      ...originalEnv,
      STARTUP_HEALTH_CHECKS: 'true',
      STARTUP_VALIDATE_SECRETS: 'true',
      NODE_ENV: 'production',
      JWT_ENABLED: 'true',
      JWT_SECRET: '',
    };

    const { StartupHealthChecks } = await import('@/health/StartupHealthChecks');
    const report = await StartupHealthChecks.run();

    expect(report.ok).toBe(false);
    expect(report.checks.some((c) => c.name === 'startup.secrets' && c.ok === false)).toBe(true);
    await expect(StartupHealthChecks.assertHealthy()).rejects.toThrow(/health checks failed/i);
  });

  it('runs DB + cache probes when enabled', async () => {
    vi.resetModules();
    process.env = {
      ...originalEnv,
      STARTUP_HEALTH_CHECKS: 'true',
      STARTUP_VALIDATE_SECRETS: 'false',
      STARTUP_CHECK_DB: 'true',
      STARTUP_CHECK_CACHE: 'true',
      STARTUP_HEALTH_TIMEOUT_MS: '2500',
      NODE_ENV: 'production',
      DB_CONNECTION: 'sqlite',
    };

    const mockDb = {
      connect: vi.fn(async () => undefined),
      disconnect: vi.fn(async () => undefined),
      queryOne: vi.fn(async () => ({ ok: 1 })),
    };

    vi.doMock('@orm/Database', () => ({
      Database: {
        create: () => mockDb,
      },
    }));

    vi.doMock('@cache/Cache', () => ({
      Cache: {
        set: vi.fn(async () => undefined),
        get: vi.fn(async () => ({ ok: true })),
        delete: vi.fn(async () => undefined),
      },
    }));

    const { StartupHealthChecks } = await import('@/health/StartupHealthChecks');
    const report = await StartupHealthChecks.run();

    expect(report.ok).toBe(true);
    expect(report.checks.some((c) => c.name === 'startup.database' && c.ok === true)).toBe(true);
    expect(report.checks.some((c) => c.name === 'startup.cache' && c.ok === true)).toBe(true);
    expect(mockDb.connect).toHaveBeenCalledTimes(1);
    expect(mockDb.queryOne).toHaveBeenCalledWith('SELECT 1 as ok', []);
    expect(mockDb.disconnect).toHaveBeenCalledTimes(1);
  });

  it('marks DB check as failed on timeout and continues when configured', async () => {
    vi.resetModules();

    process.env = {
      ...originalEnv,
      STARTUP_HEALTH_CHECKS: 'true',
      STARTUP_VALIDATE_SECRETS: 'false',
      STARTUP_CHECK_DB: 'true',
      STARTUP_CHECK_CACHE: 'false',
      STARTUP_HEALTH_TIMEOUT_MS: '10',
      STARTUP_CONTINUE_ON_FAILURE: 'true',
      NODE_ENV: 'production',
      DB_CONNECTION: 'sqlite',
    };

    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

    vi.doMock('@orm/Database', () => ({
      Database: {
        create: () => ({
          connect: vi.fn(() => sleep(50)),
          disconnect: vi.fn(async () => undefined),
          queryOne: vi.fn(async () => ({ ok: 1 })),
        }),
      },
    }));

    vi.doMock('@config/logger', () => ({
      Logger: {
        warn: vi.fn(),
        info: vi.fn(),
        error: vi.fn(),
      },
    }));

    const { StartupHealthChecks } = await import('@/health/StartupHealthChecks');

    const report = await StartupHealthChecks.run();

    expect(report.ok).toBe(false);
    expect(report.checks.some((c) => c.name === 'startup.database' && c.ok === false)).toBe(true);

    await expect(StartupHealthChecks.assertHealthy()).resolves.toBeDefined();
  });
});
