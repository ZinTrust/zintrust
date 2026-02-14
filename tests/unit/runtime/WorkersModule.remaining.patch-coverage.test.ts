import * as nodePath from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function existsSyncWorkersPath(pathValue: string): boolean {
  if (pathValue === '/tmp/workers' || pathValue === '/tmp/queue-monitor') return true;
  if (pathValue.endsWith('/dir/index.js')) return true;
  if (pathValue.endsWith('/dist/packages/workers/src/index.js')) return false;
  if (pathValue.endsWith('/packages/workers/src/index.ts')) return false;
  if (pathValue.endsWith('/dist/packages/queue-monitor/src/index.js')) return false;
  if (pathValue.endsWith('/packages/queue-monitor/src/index.ts')) return false;
  if (pathValue.endsWith('.js')) return true;
  return false;
}

function existsSyncQueueMonitorPath(pathValue: string): boolean {
  if (pathValue === '/tmp/queue-monitor') return true;
  if (pathValue.endsWith('/dir/index.js')) return true;
  if (pathValue.endsWith('/packages/queue-monitor/src/index.ts')) return true;
  if (pathValue.endsWith('/dist/packages/queue-monitor/src/index.js')) return false;
  if (pathValue.endsWith('.js')) return true;
  return false;
}

const statSyncByPath = (
  pathValue: string
): { isDirectory: () => boolean; isFile: () => boolean } => ({
  isDirectory: () => pathValue.endsWith('/dir'),
  isFile: () => pathValue.endsWith('.js'),
});

const listEntryFiles = (): Array<{
  name: string;
  isDirectory: () => boolean;
  isFile: () => boolean;
}> => [
  {
    name: 'entry.js',
    isDirectory: () => false,
    isFile: () => true,
  },
];

const createPathModule = (): typeof import('node:path') => nodePath;

const createUrlModule = (): { pathToFileURL: typeof import('node:url').pathToFileURL } => ({
  pathToFileURL,
});

const createWorkersFsModule = (): Record<string, unknown> => ({
  existsSync: vi.fn(existsSyncWorkersPath),
  statSync: vi.fn(statSyncByPath),
  readdirSync: vi.fn((_dir: string) => listEntryFiles()),
  readFileSync: vi.fn(() => "import './dir'\nexport * from './rel'\n"),
  writeFileSync: vi.fn(),
});

const createQueueMonitorFsModule = (): Record<string, unknown> => ({
  existsSync: vi.fn(existsSyncQueueMonitorPath),
  statSync: vi.fn(statSyncByPath),
  readdirSync: vi.fn(() => listEntryFiles()),
  readFileSync: vi.fn(() => "import './dir'\n"),
  writeFileSync: vi.fn(),
});

function resolveWorkersEntry(): string {
  return '/tmp/workers/index.js';
}

function resolveQueueMonitorEntry(pkg: string): string {
  return `/tmp/${pkg.replace('@zintrust/', '')}/index.js`;
}

function createRequireWithWorkersEntry(): { resolve: () => string } {
  return { resolve: resolveWorkersEntry };
}

function createRequireWithQueueMonitorEntry(): { resolve: (pkg: string) => string } {
  return { resolve: resolveQueueMonitorEntry };
}

const createNodeSingletonsModuleForWorkers = (): { createRequire: ReturnType<typeof vi.fn> } => ({
  createRequire: vi.fn(createRequireWithWorkersEntry),
});

const createNodeSingletonsModuleForQueueMonitor = (): {
  createRequire: ReturnType<typeof vi.fn>;
} => ({
  createRequire: vi.fn(createRequireWithQueueMonitorEntry),
});

const createLoggerWarnModule = (warn: ReturnType<typeof vi.fn>): { Logger: { warn: unknown } } => ({
  Logger: { warn },
});

function runFromSourceFalse(): boolean {
  return false;
}

function runFromSourceTrue(): boolean {
  return true;
}

const createCommonModule = (
  runFromSourceImpl: () => boolean
): { runFromSource: ReturnType<typeof vi.fn> } => ({
  runFromSource: vi.fn(runFromSourceImpl),
});

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

    vi.doMock('@config/logger', () => createLoggerWarnModule(warn));
    vi.doMock('@/common', () => createCommonModule(runFromSourceFalse));
    vi.doMock('@node-singletons/module', createNodeSingletonsModuleForWorkers);
    vi.doMock('@node-singletons/path', createPathModule);
    vi.doMock('@node-singletons/url', createUrlModule);

    vi.doMock('@node-singletons/fs', createWorkersFsModule);

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

    vi.doMock('@config/logger', () => createLoggerWarnModule(warn));
    vi.doMock('@/common', () => createCommonModule(runFromSourceTrue));
    vi.doMock('@node-singletons/module', createNodeSingletonsModuleForQueueMonitor);
    vi.doMock('@node-singletons/path', createPathModule);
    vi.doMock('@node-singletons/url', createUrlModule);

    vi.doMock('@node-singletons/fs', createQueueMonitorFsModule);

    const mod = await import('@runtime/WorkersModule');
    await expect(mod.loadQueueMonitorModule()).resolves.toBeDefined();
  });

  it.skip('retry-after-failure promise reassignment branch requires true import() module-not-found runtime error', async () => {
    expect(true).toBe(true);
    // This branch depends on real ESM import() producing ERR_MODULE_NOT_FOUND with package name in message,
    // which Vitest mock-factory failures wrap and normalize. Kept as explicit skip per request.
  });
});
