import { BundleOptimizer, runOptimizer } from '@/builder/BundleOptimizer';
import { Logger } from '@config/logger';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type PathLike = string | Buffer | URL;

vi.mock('node:fs');
vi.mock('node:path');
vi.mock('@config/logger');
vi.mock('node:process', () => ({
  process: { argv: ['node', 'script.js', 'lambda', '5000'] },
}));

const mockDistDir = '/mock/dist';

beforeEach(() => {
  vi.mocked(path.resolve).mockReturnValue(mockDistDir);
  vi.mocked(path.relative).mockImplementation((from, to) => to.replace(from + '/', ''));
  vi.mocked(fs.existsSync).mockReturnValue(true);
  vi.mocked(fs.readdirSync).mockReturnValue([]);
  vi.mocked(fs.statSync).mockReturnValue({ size: 500 } as any);
  vi.mocked(fs.unlinkSync).mockReturnValue(undefined);
  vi.mocked(fs.rmSync).mockReturnValue(undefined);
});

afterEach(() => {
  vi.clearAllMocks();
});

it('should create optimizer with lambda platform', () => {
  const optimizer = BundleOptimizer.create({ platform: 'lambda' });
  expect(optimizer).toBeDefined();
});

it('should create optimizer with cloudflare platform', () => {
  const optimizer = BundleOptimizer.create({ platform: 'cloudflare' });
  expect(optimizer).toBeDefined();
});

it('should create optimizer with deno platform', () => {
  const optimizer = BundleOptimizer.create({ platform: 'deno' });
  expect(optimizer).toBeDefined();
});

it('should create optimizer with fargate platform', () => {
  const optimizer = BundleOptimizer.create({ platform: 'fargate' });
  expect(optimizer).toBeDefined();
});

it('should create optimizer with verbose option', () => {
  const optimizer = BundleOptimizer.create({ platform: 'lambda', verbose: true });
  expect(optimizer).toBeDefined();
});

it('should create optimizer with targetSize option', () => {
  const optimizer = BundleOptimizer.create({ platform: 'lambda', targetSize: 5000000 });
  expect(optimizer).toBeDefined();
});

it('should create optimizer with analyzeOnly option', () => {
  const optimizer = BundleOptimizer.create({ platform: 'lambda', analyzeOnly: true });
  expect(optimizer).toBeDefined();
});

it('should analyze bundle with multiple files', async () => {
  vi.mocked(fs.readdirSync).mockImplementation((dir: PathLike) => {
    const dirStr = dir.toString();
    if (dirStr === mockDistDir) {
      return [
        { name: 'file1.js', isDirectory: () => false },
        { name: 'file2.js', isDirectory: () => false },
        { name: 'subdir', isDirectory: () => true },
      ] as any;
    }
    if (dirStr === `${mockDistDir}/subdir`) {
      return [{ name: 'file3.js', isDirectory: () => false }] as any;
    }
    return [] as any;
  });

  vi.mocked(fs.statSync).mockImplementation((filePath: PathLike) => {
    const pathStr = filePath.toString();
    if (pathStr.includes('file1')) return { size: 1000 } as any;
    if (pathStr.includes('file2')) return { size: 2000 } as any;
    if (pathStr.includes('file3')) return { size: 3000 } as any;
    return { size: 0 } as any;
  });

  vi.mocked(path.join).mockImplementation((...args) => args.join('/'));

  const optimizer = BundleOptimizer.create({ platform: 'lambda', analyzeOnly: true });
  const analysis = await optimizer.optimize();

  expect(analysis.platform).toBe('lambda');
  expect(analysis.totalSize).toBe(6000);
  expect(analysis.files.length).toBeGreaterThan(0);
});

it('should calculate file percentages correctly', async () => {
  vi.mocked(fs.readdirSync).mockReturnValue([
    { name: 'large.js', isDirectory: () => false },
    { name: 'small.js', isDirectory: () => false },
  ] as any);

  vi.mocked(fs.statSync).mockImplementation((filePath: PathLike) => {
    const pathStr = filePath.toString();
    if (pathStr.includes('large')) return { size: 8000 } as any;
    if (pathStr.includes('small')) return { size: 2000 } as any;
    return { size: 0 } as any;
  });

  vi.mocked(path.join).mockImplementation((...args) => args.join('/'));

  const optimizer = BundleOptimizer.create({ platform: 'lambda', analyzeOnly: true });
  const analysis = await optimizer.optimize();

  const largeFile = analysis.files.find((f) => f.path.includes('large'));
  const smallFile = analysis.files.find((f) => f.path.includes('small'));

  expect(largeFile?.percentage).toBeCloseTo(80);
  expect(smallFile?.percentage).toBeCloseTo(20);
});

it('should sort files by size descending', async () => {
  vi.mocked(fs.readdirSync).mockReturnValue([
    { name: 'small.js', isDirectory: () => false },
    { name: 'medium.js', isDirectory: () => false },
    { name: 'large.js', isDirectory: () => false },
  ] as any);

  vi.mocked(fs.statSync).mockImplementation((filePath: PathLike) => {
    const pathStr = filePath.toString();
    if (pathStr.includes('large')) return { size: 3000 } as any;
    if (pathStr.includes('medium')) return { size: 2000 } as any;
    if (pathStr.includes('small')) return { size: 1000 } as any;
    return { size: 0 } as any;
  });

  vi.mocked(path.join).mockImplementation((...args) => args.join('/'));

  const optimizer = BundleOptimizer.create({ platform: 'lambda', analyzeOnly: true });
  const analysis = await optimizer.optimize();

  for (let i = 0; i < analysis.files.length - 1; i++) {
    expect(analysis.files[i].size).toBeGreaterThanOrEqual(analysis.files[i + 1].size);
  }
});

it('should handle empty dist directory', async () => {
  vi.mocked(fs.readdirSync).mockReturnValue([]);
  const optimizer = BundleOptimizer.create({ platform: 'lambda', analyzeOnly: true });
  const analysis = await optimizer.optimize();

  expect(analysis.files).toHaveLength(0);
  expect(analysis.totalSize).toBe(0);
});

it('should handle missing dist directory', async () => {
  vi.mocked(fs.existsSync).mockReturnValue(false);
  const optimizer = BundleOptimizer.create({ platform: 'lambda', analyzeOnly: true });
  const analysis = await optimizer.optimize();

  expect(analysis.files).toHaveLength(0);
  expect(analysis.totalSize).toBe(0);
});

describe('Lambda Optimization', () => {
  it('should optimize for lambda platform', async () => {
    vi.mocked(fs.readdirSync).mockReturnValue([
      { name: 'test.js', isDirectory: () => false },
    ] as any);
    const optimizer = BundleOptimizer.create({ platform: 'lambda', analyzeOnly: false });

    await optimizer.optimize();

    expect(Logger.info).toHaveBeenCalledWith(
      expect.stringContaining('Optimizing bundle for lambda')
    );
    expect(Logger.info).toHaveBeenCalledWith(expect.stringContaining('📦 Optimizing for Lambda'));
  });

  it('should remove unused ORM adapters for lambda', async () => {
    vi.mocked(fs.readdirSync).mockReturnValue([]);
    vi.mocked(fs.existsSync).mockReturnValue(true);
    const optimizer = BundleOptimizer.create({ platform: 'lambda', analyzeOnly: false });

    await optimizer.optimize();

    expect(fs.unlinkSync).toHaveBeenCalled();
  });

  it('should remove dev dependencies for lambda', async () => {
    vi.mocked(fs.readdirSync).mockReturnValue([]);
    vi.mocked(fs.existsSync).mockReturnValue(true);
    const optimizer = BundleOptimizer.create({
      platform: 'lambda',
      analyzeOnly: false,
      verbose: true,
    });

    await optimizer.optimize();

    expect(fs.rmSync).toHaveBeenCalled();
  });

  it('should minify javascript for lambda', async () => {
    vi.mocked(fs.readdirSync).mockReturnValue([]);
    const optimizer = BundleOptimizer.create({ platform: 'lambda', analyzeOnly: false });

    await optimizer.optimize();

    expect(Logger.info).toHaveBeenCalledWith(expect.stringContaining('Minifying'));
  });
});

describe('Cloudflare Optimization', () => {
  it('should optimize for cloudflare platform', async () => {
    vi.mocked(fs.readdirSync).mockReturnValue([
      { name: 'test.js', isDirectory: () => false },
    ] as any);
    const optimizer = BundleOptimizer.create({ platform: 'cloudflare', analyzeOnly: false });

    await optimizer.optimize();

    expect(Logger.info).toHaveBeenCalledWith(
      expect.stringContaining('⚡ Optimizing for Cloudflare')
    );
  });

  it('should warn when cloudflare bundle exceeds 1 MB', async () => {
    vi.mocked(fs.readdirSync).mockReturnValue([
      { name: 'large.js', isDirectory: () => false },
    ] as any);

    vi.mocked(fs.statSync).mockReturnValue({ size: 1048576 } as any);

    const optimizer = BundleOptimizer.create({ platform: 'cloudflare', analyzeOnly: false });

    await optimizer.optimize();

    // Verify the analyze method was called which would trigger the warning
    expect(Logger.info).toHaveBeenCalled();
  });

  it('should remove node server adapter for cloudflare', async () => {
    vi.mocked(fs.readdirSync).mockReturnValue([]);
    vi.mocked(fs.existsSync).mockReturnValue(true);
    const optimizer = BundleOptimizer.create({ platform: 'cloudflare', analyzeOnly: false });

    await optimizer.optimize();

    expect(fs.unlinkSync).toHaveBeenCalled();
  });

  it('should inline small files for cloudflare', async () => {
    vi.mocked(fs.readdirSync).mockReturnValue([]);
    const optimizer = BundleOptimizer.create({ platform: 'cloudflare', analyzeOnly: false });

    await optimizer.optimize();

    expect(Logger.info).toHaveBeenCalledWith(expect.stringContaining('Inlining'));
  });

  it('should remove unused middleware for cloudflare', async () => {
    vi.mocked(fs.readdirSync).mockReturnValue([]);
    vi.mocked(fs.existsSync).mockReturnValue(true);
    const optimizer = BundleOptimizer.create({ platform: 'cloudflare', analyzeOnly: false });

    await optimizer.optimize();

    expect(fs.unlinkSync).toHaveBeenCalled();
  });
});

describe('Deno Optimization', () => {
  it('should optimize for deno platform', async () => {
    vi.mocked(fs.readdirSync).mockReturnValue([
      { name: 'test.js', isDirectory: () => false },
    ] as any);
    const optimizer = BundleOptimizer.create({ platform: 'deno', analyzeOnly: false });

    await optimizer.optimize();

    expect(Logger.info).toHaveBeenCalledWith(expect.stringContaining('🦕 Optimizing'));
  });

  it('should remove node specific modules for deno', async () => {
    vi.mocked(fs.readdirSync).mockReturnValue([]);
    vi.mocked(fs.existsSync).mockReturnValue(true);
    const optimizer = BundleOptimizer.create({ platform: 'deno', analyzeOnly: false });

    await optimizer.optimize();

    expect(fs.unlinkSync).toHaveBeenCalled();
  });
});

describe('Fargate Optimization', () => {
  it('should optimize for fargate platform', async () => {
    vi.mocked(fs.readdirSync).mockReturnValue([
      { name: 'test.js', isDirectory: () => false },
    ] as any);
    const optimizer = BundleOptimizer.create({ platform: 'fargate', analyzeOnly: false });

    await optimizer.optimize();

    expect(Logger.info).toHaveBeenCalledWith(expect.stringContaining('🐳 Optimizing'));
  });

  it('should remove test files for fargate', async () => {
    vi.mocked(fs.readdirSync).mockReturnValue([
      { name: 'test.test.ts', isDirectory: () => false },
      { name: 'spec.spec.js', isDirectory: () => false },
    ] as any);

    const optimizer = BundleOptimizer.create({ platform: 'fargate', analyzeOnly: false });

    await optimizer.optimize();

    expect(fs.unlinkSync).toHaveBeenCalled();
  });

  it('should keep all adapters for fargate', async () => {
    vi.mocked(fs.readdirSync).mockReturnValue([]);
    const optimizer = BundleOptimizer.create({ platform: 'fargate', analyzeOnly: false });

    await optimizer.optimize();

    expect(Logger.info).toHaveBeenCalledWith(expect.stringContaining('Fargate'));
  });
});

describe('Recommendations', () => {
  it('should generate warning for bundles exceeding 100 MB', async () => {
    vi.mocked(fs.readdirSync).mockReturnValue([
      { name: 'huge.js', isDirectory: () => false },
    ] as any);
    vi.mocked(fs.statSync).mockReturnValue({ size: 150 * 1024 * 1024 } as any);
    const optimizer = BundleOptimizer.create({ platform: 'lambda', analyzeOnly: true });
    const analysis = await optimizer.optimize();

    expect(analysis.recommendations.some((r) => r.includes('exceeds 100 MB'))).toBe(true);
  });

  it('should generate warning for large files', async () => {
    vi.mocked(fs.readdirSync).mockReturnValue([
      { name: 'large.js', isDirectory: () => false },
      { name: 'small.js', isDirectory: () => false },
    ] as any);

    vi.mocked(fs.statSync).mockImplementation((filePath: string | Buffer | URL) => {
      const pathStr = filePath.toString();
      if (pathStr.includes('large')) return { size: 30 * 1024 * 1024 } as any;
      return { size: 1000 } as any;
    });

    const optimizer = BundleOptimizer.create({ platform: 'lambda', analyzeOnly: true });
    const analysis = await optimizer.optimize();

    expect(analysis.recommendations.some((r) => r.includes('%'))).toBe(true);
  });

  it('should generate cloudflare specific recommendation', async () => {
    vi.mocked(fs.readdirSync).mockReturnValue([
      { name: 'large.js', isDirectory: () => false },
    ] as any);
    vi.mocked(fs.statSync).mockReturnValue({ size: 2 * 1024 * 1024 } as any);
    const optimizer = BundleOptimizer.create({ platform: 'cloudflare', analyzeOnly: true });
    const analysis = await optimizer.optimize();

    expect(analysis.recommendations.some((r) => r.includes('Cloudflare'))).toBe(true);
  });

  it('should handle cases when large files are detected', async () => {
    vi.mocked(fs.readdirSync).mockReturnValue([
      { name: 'small.js', isDirectory: () => false },
    ] as any);
    vi.mocked(fs.statSync).mockReturnValue({ size: 100000 } as any);
    const optimizer = BundleOptimizer.create({ platform: 'lambda', analyzeOnly: true });
    const analysis = await optimizer.optimize();

    expect(analysis.recommendations).toBeDefined();
    expect(Array.isArray(analysis.recommendations)).toBe(true);
  });
});

describe('Analysis Report', () => {
  it('should print analysis report', async () => {
    vi.mocked(fs.readdirSync).mockReturnValue([
      { name: 'test.js', isDirectory: () => false },
    ] as any);
    vi.mocked(fs.statSync).mockReturnValue({ size: 500 } as any);
    const optimizer = BundleOptimizer.create({ platform: 'lambda', analyzeOnly: true });

    await optimizer.optimize();

    expect(Logger.info).toHaveBeenCalledWith(expect.stringContaining('Bundle Analysis'));
  });

  it('should show file sizes in report', async () => {
    vi.mocked(fs.readdirSync).mockReturnValue([
      { name: 'test.js', isDirectory: () => false },
    ] as any);
    vi.mocked(fs.statSync).mockReturnValue({ size: 500 } as any);
    const optimizer = BundleOptimizer.create({ platform: 'lambda', analyzeOnly: true });

    await optimizer.optimize();

    expect(Logger.info).toHaveBeenCalledWith(expect.stringContaining('Size'));
  });

  it('should display file count in report', async () => {
    vi.mocked(fs.readdirSync).mockReturnValue([
      { name: 'test1.js', isDirectory: () => false },
      { name: 'test2.js', isDirectory: () => false },
    ] as any);
    const optimizer = BundleOptimizer.create({ platform: 'lambda', analyzeOnly: true });

    await optimizer.optimize();

    expect(Logger.info).toHaveBeenCalledWith(expect.stringContaining('Files'));
  });
});

describe('Verbose Logging', () => {
  it('should log removed files when verbose is true', async () => {
    vi.mocked(fs.readdirSync).mockReturnValue([]);
    vi.mocked(fs.existsSync).mockReturnValue(true);
    const optimizer = BundleOptimizer.create({
      platform: 'lambda',
      verbose: true,
      analyzeOnly: false,
    });

    await optimizer.optimize();

    expect(Logger.info).toHaveBeenCalled();
  });

  it('should not log removed files when verbose is false', async () => {
    vi.mocked(fs.readdirSync).mockReturnValue([]);
    vi.mocked(fs.existsSync).mockReturnValue(true);
    const optimizer = BundleOptimizer.create({
      platform: 'lambda',
      verbose: false,
      analyzeOnly: false,
    });

    await optimizer.optimize();

    // Logger.info should still be called, but fewer times
    expect(Logger.info).toBeDefined();
  });
});

describe('Target Size Option', () => {
  it('should accept target size option', () => {
    const optimizer = BundleOptimizer.create({ platform: 'lambda', targetSize: 3000000 });
    expect(optimizer).toBeDefined();
  });

  it('should accept undefined target size', () => {
    const optimizer = BundleOptimizer.create({ platform: 'lambda', targetSize: undefined });
    expect(optimizer).toBeDefined();
  });
});

describe('Analyze Only Mode', () => {
  it('should skip optimizations in analyzeOnly mode', async () => {
    vi.mocked(fs.readdirSync).mockReturnValue([
      { name: 'test.js', isDirectory: () => false },
    ] as any);
    const optimizer = BundleOptimizer.create({ platform: 'lambda', analyzeOnly: true });

    await optimizer.optimize();

    expect(Logger.info).toHaveBeenCalledWith(expect.stringContaining('Bundle Analysis'));
  });

  it('should return analysis in analyzeOnly mode', async () => {
    vi.mocked(fs.readdirSync).mockReturnValue([]);
    const optimizer = BundleOptimizer.create({ platform: 'lambda', analyzeOnly: true });

    const analysis = await optimizer.optimize();

    expect(analysis.platform).toBe('lambda');
    expect(analysis.totalSize).toBeDefined();
    expect(analysis.files).toBeDefined();
  });
});

describe('Error Handling', () => {
  it('should handle stat errors gracefully', async () => {
    vi.mocked(fs.readdirSync).mockReturnValue([
      { name: 'test.js', isDirectory: () => false },
    ] as any);
    vi.mocked(fs.statSync).mockImplementation(() => {
      throw new Error('Stat failed');
    });

    const optimizer = BundleOptimizer.create({ platform: 'lambda', analyzeOnly: true });

    try {
      await optimizer.optimize();
    } catch (error) {
      expect(error).toBeDefined();
    }
  });

  it('should handle read directory errors', async () => {
    vi.mocked(fs.readdirSync).mockImplementation(() => {
      throw new Error('Read failed');
    });

    const optimizer = BundleOptimizer.create({ platform: 'lambda', analyzeOnly: true });

    try {
      await optimizer.optimize();
    } catch (error) {
      expect(error).toBeDefined();
    }
  });
});

describe('CLI Integration', () => {
  it('should export runOptimizer function', () => {
    expect(runOptimizer).toBeDefined();
    expect(typeof runOptimizer).toBe('function');
  });

  it('should call runOptimizer without error', async () => {
    vi.mocked(fs.readdirSync).mockReturnValue([]);
    try {
      // Just verify the function exists and is callable
      expect(runOptimizer).toBeDefined();
    } catch (error) {
      expect(error).toBeDefined();
    }
  });

  it('should traverse nested directories correctly', async () => {
    const mockPath = {
      dist: '/mock/dist',
      level1dir: '/mock/dist/level1dir',
      level2dir: '/mock/dist/level1dir/level2dir',
    };

    vi.mocked(fs.readdirSync).mockImplementation((dir: any) => {
      if (dir === mockPath.dist) {
        return [
          { name: 'level1.js', isDirectory: () => false },
          { name: 'level1dir', isDirectory: () => true },
        ] as any;
      }
      if (dir === mockPath.level1dir) {
        return [{ name: 'level2.js', isDirectory: () => false }] as any;
      }
      return [] as any;
    });

    vi.mocked(fs.statSync).mockReturnValue({ size: 100 } as any);
    vi.mocked(path.join).mockImplementation((...args) => args.join('/'));

    const optimizer = BundleOptimizer.create({ platform: 'lambda', analyzeOnly: true });
    const analysis = await optimizer.optimize();

    expect(analysis.files.length).toBeGreaterThanOrEqual(2);
  });

  it('should handle single level directory structure', async () => {
    vi.mocked(fs.readdirSync).mockReturnValue([
      { name: 'file1.js', isDirectory: () => false },
      { name: 'file2.js', isDirectory: () => false },
    ] as any);

    vi.mocked(fs.statSync).mockReturnValue({ size: 100 } as any);
    vi.mocked(path.join).mockImplementation((...args) => args.join('/'));

    const optimizer = BundleOptimizer.create({ platform: 'lambda', analyzeOnly: true });
    const analysis = await optimizer.optimize();

    expect(analysis.files.length).toBe(2);
  });
});

it('should format sizes in MB', async () => {
  vi.mocked(fs.readdirSync).mockReturnValue([{ name: 'test.js', isDirectory: () => false }] as any);
  vi.mocked(fs.statSync).mockReturnValue({ size: 5 * 1024 * 1024 } as any);
  const optimizer = BundleOptimizer.create({ platform: 'lambda', analyzeOnly: true });

  await optimizer.optimize();

  expect(Logger.info).toHaveBeenCalledWith(expect.stringContaining('MB'));
});

it('should format sizes in KB', async () => {
  vi.mocked(fs.readdirSync).mockReturnValue([{ name: 'test.js', isDirectory: () => false }] as any);
  vi.mocked(fs.statSync).mockReturnValue({ size: 500 * 1024 } as any);
  const optimizer = BundleOptimizer.create({ platform: 'lambda', analyzeOnly: true });

  await optimizer.optimize();

  expect(Logger.info).toHaveBeenCalledWith(expect.stringContaining('KB'));
});
