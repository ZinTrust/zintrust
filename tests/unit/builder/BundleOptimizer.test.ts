import { BundleOptimizer } from '@/builder/BundleOptimizer';
import { Logger } from '@config/logger';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:fs');
vi.mock('node:path');
vi.mock('@config/logger');

describe('BundleOptimizer', () => {
  const mockDistDir = '/mock/dist';

  beforeEach(() => {
    vi.mocked(path.resolve).mockReturnValue(mockDistDir);
    vi.mocked(path.relative).mockImplementation((from, to) => to.replace(from + '/', ''));
    vi.mocked(fs.existsSync).mockReturnValue(true);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should analyze bundle correctly', async () => {
    // Mock file system structure
    vi.mocked(fs.readdirSync).mockImplementation((dir: any) => {
      if (dir === mockDistDir) {
        return [
          { name: 'file1.js', isDirectory: () => false },
          { name: 'subdir', isDirectory: () => true },
        ] as any;
      }
      if (dir === path.join(mockDistDir, 'subdir')) {
        return [{ name: 'file2.js', isDirectory: () => false }] as any;
      }
      return [] as any;
    });

    vi.mocked(fs.statSync).mockImplementation((filePath: any) => {
      if (filePath === path.join(mockDistDir, 'file1.js')) {
        return { isDirectory: () => false, size: 500 } as any;
      }
      if (filePath === path.join(mockDistDir, 'subdir', 'file2.js')) {
        return { isDirectory: () => false, size: 500 } as any;
      }
      return { isDirectory: () => false, size: 0 } as any;
    });

    vi.mocked(path.join).mockImplementation((...args) => args.join('/'));

    const optimizer = new BundleOptimizer({ platform: 'lambda', analyzeOnly: true });
    const analysis = await optimizer.optimize();

    expect(analysis.platform).toBe('lambda');
    expect(analysis.totalSize).toBe(1000); // 2 files * 500
    expect(analysis.files).toHaveLength(2);
    expect(Logger.info).toHaveBeenCalled();
  });

  it('should call platform specific optimization for lambda', async () => {
    vi.mocked(fs.readdirSync).mockReturnValue([]);
    const optimizer = new BundleOptimizer({ platform: 'lambda' });

    await optimizer.optimize();
    expect(Logger.info).toHaveBeenCalledWith(
      expect.stringContaining('Optimizing bundle for lambda')
    );
  });

  it('should call platform specific optimization for cloudflare', async () => {
    vi.mocked(fs.readdirSync).mockReturnValue([]);
    const optimizer = new BundleOptimizer({ platform: 'cloudflare' });
    await optimizer.optimize();
    expect(Logger.info).toHaveBeenCalledWith(
      expect.stringContaining('Optimizing bundle for cloudflare')
    );
  });
});
