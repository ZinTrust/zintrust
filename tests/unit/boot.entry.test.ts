import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('@zintrust/core/boot entry', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.doUnmock('@runtime/detectRuntime');
    vi.doUnmock('@node-singletons/fs');
    vi.doUnmock('@node-singletons/path');
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it('loads env before importing bootstrap in node runtime', async () => {
    process.env['ZINTRUST_PROJECT_ROOT'] = '/workspace';

    const order: string[] = [];
    const ensureLoaded = vi.fn(() => {
      order.push('env');
      return { loadedFiles: ['.env'] };
    });

    vi.doMock('@runtime/detectRuntime', () => ({
      isNodeRuntime: () => true,
    }));
    vi.doMock('@cli/utils/EnvFileLoader', () => ({
      EnvFileLoader: {
        ensureLoaded,
      },
    }));
    vi.doMock('@config/logger', () => ({
      Logger: {
        warn: vi.fn(),
      },
    }));
    vi.doMock('@boot/bootstrap', () => {
      order.push('boot');
      return {};
    });

    await import('@/boot');

    expect(order).toEqual(['env', 'boot']);
    expect(ensureLoaded).toHaveBeenCalledWith({
      cwd: '/workspace',
      includeCwd: true,
    });
  });

  it('warns once when node boot finds no env files', async () => {
    process.env['ZINTRUST_PROJECT_ROOT'] = '/workspace';

    const warn = vi.fn();

    vi.doMock('@runtime/detectRuntime', () => ({
      isNodeRuntime: () => true,
    }));
    vi.doMock('@cli/utils/EnvFileLoader', () => ({
      EnvFileLoader: {
        ensureLoaded: vi.fn(() => ({ loadedFiles: [] })),
      },
    }));
    vi.doMock('@config/logger', () => ({
      Logger: {
        warn,
      },
    }));
    vi.doMock('@node-singletons/fs', () => ({
      existsSync: vi.fn(() => false),
    }));
    vi.doMock('@node-singletons/path', async (importOriginal) => {
      const actual = (await importOriginal()) as Record<string, unknown> & {
        join: (...parts: string[]) => string;
      };
      return {
        ...actual,
        join: (...parts: string[]) => parts.join('/'),
      };
    });
    vi.doMock('@boot/bootstrap', () => ({}));

    await import('@/boot');

    expect(warn).toHaveBeenCalledWith('Node bootstrap started without loaded env files.', {
      projectRoot: '/workspace',
      resolvedDotEnv: 'missing',
      entry: '@zintrust/core/boot',
    });
  });

  it('loads env before bootstrap resolves appConfig-backed flags', async () => {
    process.env['ZINTRUST_PROJECT_ROOT'] = '/workspace';
    delete process.env['WORKER_ENABLED'];
    let workerEnabledAtBootstrap: boolean | undefined;

    vi.doMock('@cli/utils/EnvFileLoader', () => ({
      EnvFileLoader: {
        ensureLoaded: vi.fn(() => {
          process.env['WORKER_ENABLED'] = 'true';
          return { loadedFiles: ['.env'] };
        }),
      },
    }));
    vi.doMock('@config/logger', () => ({
      Logger: {
        warn: vi.fn(),
      },
    }));
    vi.doMock('@boot/bootstrap', async () => {
      const { appConfig } = await import('@config/app');
      workerEnabledAtBootstrap = appConfig.worker;
      return {};
    });

    await import('@/boot');

    expect(workerEnabledAtBootstrap).toBe(true);
  });

  it('skips env loading outside node runtime', async () => {
    const ensureLoaded = vi.fn();
    const order: string[] = [];

    const originalVersions = process.versions;
    Object.defineProperty(process, 'versions', {
      configurable: true,
      value: undefined,
    });
    vi.doMock('@cli/utils/EnvFileLoader', () => ({
      EnvFileLoader: {
        ensureLoaded,
      },
    }));
    vi.doMock('@boot/bootstrap', () => {
      order.push('boot');
      return {};
    });

    await import('@/boot');

    expect(order).toEqual(['boot']);
    expect(ensureLoaded).not.toHaveBeenCalled();

    Object.defineProperty(process, 'versions', {
      configurable: true,
      value: originalVersions,
    });
  });
});
