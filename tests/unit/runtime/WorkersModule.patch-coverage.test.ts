import { beforeEach, describe, expect, it, vi } from 'vitest';

const workersModuleMock = { WorkerFactory: { list: () => [] } };
const queueMonitorModuleMock = { QueueMonitor: { create: vi.fn() } };

vi.mock('@zintrust/workers', () => workersModuleMock);
vi.mock('@zintrust/queue-monitor', () => queueMonitorModuleMock);

vi.mock('@/common', () => ({
  runFromSource: vi.fn(() => true),
}));

vi.mock('@config/logger', () => ({
  Logger: { info: vi.fn(), warn: vi.fn() },
}));

const fileContent = new Map<string, string>();

vi.mock('@node-singletons/fs', () => ({
  existsSync: vi.fn((p: string) => {
    // Allow the mocked package entrypoints under /tmp/...
    if (p.startsWith('/tmp/')) return true;

    // Avoid local dist fallback imports during unit tests (can be slow under coverage).
    if (p.includes('/dist/')) return false;

    return fileContent.has(p);
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
  readFileSync: vi.fn((p: string) => fileContent.get(p) ?? "import './x'\nexport * from './y'\n"),
  writeFileSync: vi.fn((p: string, v: string) => {
    fileContent.set(p, v);
  }),
}));

vi.mock('@node-singletons/module', () => ({
  createRequire: vi.fn(() => ({
    resolve: (pkg: string) => `/tmp/${pkg.replace('@zintrust/', '')}/index.js`,
  })),
}));

vi.mock('@node-singletons/path', async () => {
  const path = await import('node:path');
  return path;
});

vi.mock('@node-singletons/url', async () => {
  const url = await import('node:url');
  return { pathToFileURL: url.pathToFileURL };
});

describe('WorkersModule patch coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    fileContent.clear();
  });

  it('loads workers and queue monitor modules while applying initial patch flow', async () => {
    const mod = await import('@runtime/WorkersModule');

    const workers = await mod.loadWorkersModule();
    const monitor = await mod.loadQueueMonitorModule();

    expect(workers).toBeDefined();
    expect(workers).toHaveProperty('WorkerFactory');
    expect(monitor).toBeDefined();
    expect(monitor).toHaveProperty('QueueMonitor');
  }, 30000);

  it('can load the workers module for route registration even when worker execution is disabled', async () => {
    process.env['WORKER_ENABLED'] = 'false';

    const mod = await import('@runtime/WorkersModule');
    const workers = await mod.loadWorkersModule({ allowWhenDisabled: true });

    expect(workers).toBeDefined();
    expect(workers).toHaveProperty('WorkerFactory');
  });

  it('logs the disabled-workers import message only once', async () => {
    process.env['WORKER_ENABLED'] = 'false';

    const { Logger } = await import('@config/logger');
    const mod = await import('@runtime/WorkersModule');

    await mod.loadWorkersModule();
    await mod.loadWorkersModule();
    await mod.loadWorkersModule();

    expect(Logger.info).toHaveBeenCalledTimes(1);
    expect(Logger.info).toHaveBeenCalledWith(
      'Skipping @zintrust/workers module import (workers disabled by env).'
    );
  });
});
