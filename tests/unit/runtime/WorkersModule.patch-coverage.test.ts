import { beforeEach, describe, expect, it, vi } from 'vitest';

const workersModuleMock = { WorkerFactory: { list: () => [] } };
const queueMonitorModuleMock = { QueueMonitor: { create: vi.fn() } };

vi.mock('@zintrust/workers', () => workersModuleMock);
vi.mock('@zintrust/queue-monitor', () => queueMonitorModuleMock);

vi.mock('@/common', () => ({
  runFromSource: vi.fn(() => true),
}));

vi.mock('@config/logger', () => ({
  Logger: { warn: vi.fn() },
}));

const fileContent = new Map<string, string>();

vi.mock('@node-singletons/fs', () => ({
  existsSync: vi.fn((p: string) => {
    if (p.endsWith('/index.js')) return true;
    if (p.endsWith('.js')) return true;
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
  });
});
