import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('WorkersModule remaining patch coverage', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.doUnmock('@zintrust/workers');
    vi.doUnmock('@zintrust/queue-monitor');
    vi.doUnmock('@node-singletons/fs');
    vi.doUnmock('@node-singletons/module');
    vi.doUnmock('@node-singletons/path');
    vi.doUnmock('@node-singletons/url');
    vi.doUnmock('@/common');
    vi.doUnmock('@config/logger');
  });

  it('covers workers import failure retry and fallback attempt branches', async () => {
    const warn = vi.fn();

    vi.doMock('@config/logger', () => ({ Logger: { warn } }));
    vi.doMock('@/common', () => ({ runFromSource: vi.fn(() => false) }));
    vi.doMock('@node-singletons/module', () => ({
      createRequire: vi.fn(() => ({
        resolve: () => '/tmp/workers/index.js',
      })),
    }));
    vi.doMock('@node-singletons/path', async () => await import('node:path'));
    vi.doMock('@node-singletons/url', async () => {
      const mod = await import('node:url');
      return { pathToFileURL: mod.pathToFileURL };
    });

    vi.doMock('@node-singletons/fs', () => ({
      existsSync: vi.fn((p: string) => {
        if (p === '/tmp/workers' || p === '/tmp/queue-monitor') return true;
        if (p.endsWith('/dir/index.js')) return true;
        if (p.endsWith('/dist/packages/workers/src/index.js')) return false;
        if (p.endsWith('/packages/workers/src/index.ts')) return false;
        if (p.endsWith('/dist/packages/queue-monitor/src/index.js')) return false;
        if (p.endsWith('/packages/queue-monitor/src/index.ts')) return false;
        if (p.endsWith('.js')) return true;
        return false;
      }),
      statSync: vi.fn((p: string) => ({
        isDirectory: () => p.endsWith('/dir'),
        isFile: () => p.endsWith('.js'),
      })),
      readdirSync: vi.fn((_dir: string) => [
        {
          name: 'entry.js',
          isDirectory: () => false,
          isFile: () => true,
        },
      ]),
      readFileSync: vi.fn(() => "import './dir'\nexport * from './rel'\n"),
      writeFileSync: vi.fn(),
    }));

    vi.doMock('@zintrust/workers', () => {
      const err = new Error('Cannot find package @zintrust/workers');
      (err as unknown as { code: string }).code = 'ERR_MODULE_NOT_FOUND';
      throw err;
    });

    const mod = await import('@runtime/WorkersModule');
    await expect(mod.loadWorkersModule()).rejects.toThrow();

    expect(warn).toHaveBeenCalled();
  });

  it('covers queue monitor import failure retry and local fallback branches', async () => {
    const warn = vi.fn();

    vi.doMock('@config/logger', () => ({ Logger: { warn } }));
    vi.doMock('@/common', () => ({ runFromSource: vi.fn(() => true) }));
    vi.doMock('@node-singletons/module', () => ({
      createRequire: vi.fn(() => ({
        resolve: (pkg: string) => `/tmp/${pkg.replace('@zintrust/', '')}/index.js`,
      })),
    }));
    vi.doMock('@node-singletons/path', async () => await import('node:path'));
    vi.doMock('@node-singletons/url', async () => {
      const mod = await import('node:url');
      return { pathToFileURL: mod.pathToFileURL };
    });

    vi.doMock('@node-singletons/fs', () => ({
      existsSync: vi.fn((p: string) => {
        if (p === '/tmp/queue-monitor') return true;
        if (p.endsWith('/dir/index.js')) return true;
        if (p.endsWith('/packages/queue-monitor/src/index.ts')) return true;
        if (p.endsWith('/dist/packages/queue-monitor/src/index.js')) return false;
        if (p.endsWith('.js')) return true;
        return false;
      }),
      statSync: vi.fn((p: string) => ({
        isDirectory: () => p.endsWith('/dir'),
        isFile: () => p.endsWith('.js'),
      })),
      readdirSync: vi.fn(() => [
        {
          name: 'entry.js',
          isDirectory: () => false,
          isFile: () => true,
        },
      ]),
      readFileSync: vi.fn(() => "import './dir'\n"),
      writeFileSync: vi.fn(),
    }));

    const mod = await import('@runtime/WorkersModule');
    await expect(mod.loadQueueMonitorModule()).resolves.toBeDefined();
  });

  it.skip('retry-after-failure promise reassignment branch requires true import() module-not-found runtime error', async () => {
    // This branch depends on real ESM import() producing ERR_MODULE_NOT_FOUND with package name in message,
    // which Vitest mock-factory failures wrap and normalize. Kept as explicit skip per request.
  });
});
