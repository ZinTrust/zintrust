import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@config/logger', () => ({ Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

// Mock path helpers
vi.mock('@node-singletons/path', () => ({
  resolve: (p: string) => `/project/${p}`,
  join: (...parts: string[]) => parts.join('/'),
  relative: (from: string, to: string) => to.replace(`${from}/`, ''),
}));

// Fake fs state: one large file and one small file; adapters and middleware exist
let fakeFiles: Record<string, number> = {
  '/project/dist/a.js': 2 * 1024 * 1024, // 2 MB
  '/project/dist/lib/small.js': 512, // 0.5 KB
  '/project/dist/orm/adapters/mysqlAdapter.js': 100,
  '/project/dist/middleware/logging.js': 100,
};

const dirents: Record<string, { name: string; isDirectory: () => boolean }[]> = {
  '/project/dist': [
    { name: 'a.js', isDirectory: () => false },
    { name: 'lib', isDirectory: () => true },
    { name: 'orm', isDirectory: () => true },
    { name: 'middleware', isDirectory: () => true },
  ],
  '/project/dist/lib': [{ name: 'small.js', isDirectory: () => false }],
  '/project/dist/orm': [{ name: 'adapters', isDirectory: () => true }],
  '/project/dist/orm/adapters': [{ name: 'mysqlAdapter.js', isDirectory: () => false }],
  '/project/dist/middleware': [{ name: 'logging.js', isDirectory: () => false }],
};

vi.mock('@node-singletons/fs', () => ({
  default: {
    existsSync: (p: string) =>
      Object.prototype.hasOwnProperty.call(fakeFiles, p) ||
      Object.prototype.hasOwnProperty.call(dirents, p),
    promises: {
      readdir: async (p: string, _opts?: any) => {
        return dirents[p] ?? [];
      },
      stat: async (p: string) => ({ size: fakeFiles[p] ?? 0 }),
      unlink: async (p: string) => {
        // remove the entry without using `delete` on a dynamic key
        fakeFiles = Object.fromEntries(
          Object.entries(fakeFiles).filter(([k]) => k !== p)
        ) as Record<string, number>;
      },
      rm: async (_p: string, _opts?: any) => {
        /* noop */
      },
    },
  },
}));

import { BundleOptimizer } from '@/builder/BundleOptimizer';
import { Logger } from '@config/logger';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('patch coverage: BundleOptimizer', () => {
  it('analyzeOnly returns analysis and prints', async () => {
    const optimizer = BundleOptimizer.create({ platform: 'lambda', analyzeOnly: true });
    const analysis = await optimizer.optimize();
    expect(analysis.platform).toBe('lambda');
    expect(analysis.files.length).toBeGreaterThan(0);
    expect(Logger.info).toHaveBeenCalled();
  });

  it('optimize for cloudflare warns when bundle > 1MB', async () => {
    const optimizer = BundleOptimizer.create({ platform: 'cloudflare', verbose: true });
    const analysis = await optimizer.optimize();
    // After optimization, since fake a.js is 2MB, warn should be called
    expect(Logger.warn).toHaveBeenCalled();
    expect(analysis.totalSize).toBeGreaterThan(1024 * 1024);
  });
});
