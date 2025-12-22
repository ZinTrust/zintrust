import { beforeEach, describe, expect, it, vi } from 'vitest';

const loggerError = vi.fn();

vi.mock('@config/logger', () => ({
  Logger: {
    error: loggerError,
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

const existsSync = vi.fn<(p: string) => boolean>();
const readdirSync = vi.fn<(p: string) => string[]>();
const readFileSync = vi.fn<(p: string, encoding: string) => string>();
const mkdirSync = vi.fn<(p: string, opts: unknown) => void>();
const writeFileSync = vi.fn<(p: string, data: string) => void>();
const rmSync = vi.fn<(p: string, opts: unknown) => void>();
const statSync = vi.fn<(p: string) => { size: number }>();

vi.mock('node:fs', () => ({
  existsSync,
  readdirSync,
  readFileSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  statSync,
}));

async function loadOptimizer(tag: string): Promise<typeof import('@performance/Optimizer')> {
  return import('@performance/Optimizer?v=' + tag);
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe('GenerationCache', () => {
  it('loads cached entries from disk (only .json files)', async () => {
    // true for loadFromDisk(), false for getStats() disk scan
    existsSync.mockReturnValueOnce(true).mockReturnValue(false);
    readdirSync.mockReturnValue(['a.json', 'b.txt']);
    readFileSync.mockReturnValue('{"code":"hello","timestamp":123}');

    const { GenerationCache } = await loadOptimizer('cache-load');
    const cache = new GenerationCache('/cache-dir', 999999);

    const stats = cache.getStats();
    expect(stats.entries).toBe(1);
    expect(stats.keys).toEqual(['a']);
  });

  it('logs when disk load fails (Error and non-Error)', async () => {
    existsSync.mockReturnValue(true);

    readdirSync.mockImplementationOnce(() => {
      throw new Error('oops');
    });

    const { GenerationCache } = await loadOptimizer('cache-load-error');
    const cache = new GenerationCache('/cache-dir', 999999);
    expect(cache).toBeDefined();
    expect(loggerError).toHaveBeenCalledWith('Failed to load cache from disk: oops');

    vi.resetModules();
    vi.clearAllMocks();
    existsSync.mockReturnValue(true);
    readdirSync.mockImplementationOnce(() => {
      throw 'bad' as unknown as Error; // nosonar: Testing non-Error throw handling
    });

    const { GenerationCache: GenerationCache2 } = await loadOptimizer('cache-load-non-error');
    const cache2 = new GenerationCache2('/cache-dir', 999999);
    expect(cache2).toBeDefined();
    expect(loggerError).toHaveBeenCalledWith('Failed to load cache from disk: bad');
  });

  it('get returns null for missing entries and expires entries past TTL', async () => {
    existsSync.mockReturnValue(false);

    const { GenerationCache } = await loadOptimizer('cache-get');
    const cache = new GenerationCache('/cache-dir', 10);

    expect(cache.get('t', { a: 1 })).toBeNull();

    const nowSpy = vi
      .spyOn(Date, 'now')
      .mockReturnValueOnce(100) // set()
      .mockReturnValueOnce(105) // get() within TTL
      .mockReturnValueOnce(2000); // get() expired

    cache.set('t', { a: 1 }, 'value');
    expect(cache.get('t', { a: 1 })).toBe('value');
    expect(cache.get('t', { a: 1 })).toBeNull();
    expect(cache.getStats().entries).toBe(0);

    nowSpy.mockRestore();
  });

  it('save writes entries (and creates directory if missing)', async () => {
    existsSync.mockReturnValue(false);

    const { GenerationCache } = await loadOptimizer('cache-save');
    const cache = new GenerationCache('/cache-dir', 999999);

    vi.spyOn(Date, 'now').mockReturnValue(123);
    cache.set('t', { x: 1 }, 'code');
    cache.save();

    expect(mkdirSync).toHaveBeenCalledWith('/cache-dir', { recursive: true });
    expect(writeFileSync).toHaveBeenCalledTimes(1);
    const [writtenPath, writtenJson] = writeFileSync.mock.calls[0] ?? [];
    expect(String(writtenPath)).toContain('/cache-dir/');
    expect(String(writtenPath)).toContain('.json');
    expect(String(writtenJson)).toContain('"code"');
  });

  it('save skips mkdir when directory exists', async () => {
    // constructor loadFromDisk
    existsSync.mockReturnValueOnce(false);

    const { GenerationCache } = await loadOptimizer('cache-save-existing');
    const cache = new GenerationCache('/cache-dir', 999999);

    vi.spyOn(Date, 'now').mockReturnValue(123);
    cache.set('t', { x: 1 }, 'code');

    // save(): directory already exists
    existsSync.mockReturnValue(true);
    cache.save();

    expect(mkdirSync).not.toHaveBeenCalled();
    expect(writeFileSync).toHaveBeenCalledTimes(1);
  });

  it('clear removes disk cache when present, and getStats formats bytes', async () => {
    // For constructor loadFromDisk
    existsSync.mockReturnValue(false);
    const { GenerationCache } = await loadOptimizer('cache-clear');
    const cache = new GenerationCache('/cache-dir', 999999);

    // clear branch when dir exists
    existsSync.mockReturnValue(true);
    cache.clear();
    expect(rmSync).toHaveBeenCalledWith('/cache-dir', { recursive: true });

    // getStats: disk exists and sizes cover KB + MB
    existsSync.mockReturnValue(true);
    readdirSync.mockReturnValue(['a', 'b']);
    statSync.mockReturnValueOnce({ size: 2048 }).mockReturnValueOnce({ size: 3 * 1024 * 1024 });

    const stats = cache.getStats();
    expect(stats.size).toBe(2048 + 3 * 1024 * 1024);
    expect(stats.diskUsage).toContain('MB');

    // getStats: when disk missing
    existsSync.mockReturnValue(false);
    const stats2 = cache.getStats();
    expect(stats2.size).toBe(0);
    expect(stats2.diskUsage).toBe('0.00 B');
  });
});

describe('LazyLoader', () => {
  it('loads a module, caches it, clears cache, and logs on failure (Error + non-Error)', async () => {
    const { LazyLoader } = await loadOptimizer('lazy');
    const loader = new LazyLoader();

    const m1 = await loader.load('node:path');
    const m2 = await loader.load('node:path');
    expect(m1).toBe(m2);

    loader.clear();
    const m3 = await loader.load('node:path');
    expect(m3).toBeDefined();

    await expect(loader.load('this-module-does-not-exist-xyz')).rejects.toThrow(
      'Failed to load module: this-module-does-not-exist-xyz'
    );
    expect(loggerError).toHaveBeenCalledWith(
      'Failed to load module: this-module-does-not-exist-xyz',
      expect.any(Error)
    );

    const dataUrl = 'data:text/javascript,throw%20%22boom%22';
    await expect(loader.load(dataUrl)).rejects.toThrow(`Failed to load module: ${dataUrl}`);
    expect(loggerError).toHaveBeenCalledWith(
      `Failed to load module: ${dataUrl}`,
      expect.any(Error)
    );
  });

  it('preloads multiple modules', async () => {
    const { LazyLoader } = await loadOptimizer('lazy-preload');
    const loader = new LazyLoader();
    await loader.preload(['node:os', 'node:path']);
  });
});

describe('ParallelGenerator', () => {
  it('runs all generators and runBatch default batch size', async () => {
    const { ParallelGenerator } = await loadOptimizer('parallel');

    const results = await ParallelGenerator.runAll([
      async () => 'a',
      async () => 'b',
      async () => 'c',
    ]);
    expect(results).toEqual(['a', 'b', 'c']);

    const batched = await ParallelGenerator.runBatch([
      async () => 1,
      async () => 2,
      async () => 3,
      async () => 4,
    ]);
    expect(batched).toEqual([1, 2, 3, 4]);
  });

  it('propagates errors from runAll', async () => {
    const { ParallelGenerator } = await loadOptimizer('parallel-error');
    await expect(
      ParallelGenerator.runAll([
        async () => 'ok',
        async () => {
          throw new Error('Fail');
        },
      ])
    ).rejects.toThrow('Fail');
  });

  it('respects explicit batch size', async () => {
    const { ParallelGenerator } = await loadOptimizer('parallel-batch');
    const results = await ParallelGenerator.runBatch(
      [async () => 'a', async () => 'b', async () => 'c'],
      1
    );
    expect(results).toEqual(['a', 'b', 'c']);
  });
});

describe('Memoize', () => {
  it('caches results with default key and respects TTL expiration', async () => {
    const { Memoize } = await loadOptimizer('memo');

    let calls = 0;
    const fn = (x: number): number => {
      calls++;
      return x * 2;
    };

    const nowSpy = vi
      .spyOn(Date, 'now')
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(100)
      .mockReturnValueOnce(100);

    const memoized = Memoize.create(fn, { ttl: 50 });
    expect(memoized(5)).toBe(10);
    expect(memoized(5)).toBe(10);
    expect(calls).toBe(1);

    // TTL expired => recompute
    expect(memoized(5)).toBe(10);
    expect(calls).toBe(2);

    nowSpy.mockRestore();
  });

  it('uses a custom key generator', async () => {
    const { Memoize } = await loadOptimizer('memo-keygen');
    const fn = (obj: { id: number }): number => obj.id;
    const memoized = Memoize.create(fn, {
      keyGenerator: (args: [{ id: number }]): string => String(args[0].id),
    });

    expect(memoized({ id: 1 })).toBe(1);
    expect(memoized({ id: 1 })).toBe(1);
  });
});

describe('PerformanceOptimizer', () => {
  it('reports 0% hit rate initially and delegates save/clear', async () => {
    existsSync.mockReturnValue(false);
    const { PerformanceOptimizer } = await loadOptimizer('opt-initial');

    const optimizer = new PerformanceOptimizer();

    const priv = optimizer as unknown as {
      cache: {
        getStats: () => { size: number; keys: string[] };
        save: () => void;
        clear: () => void;
      };
      lazyLoader: { clear: () => void };
    };
    vi.spyOn(priv.cache, 'getStats').mockReturnValue({ size: 0, keys: [] });

    const stats = optimizer.getStats();
    expect(stats.hitRate).toBe('0.0%');
    expect(stats.cacheStatus).toEqual({ size: 0, keys: [] });

    const saveSpy = vi.spyOn(priv.cache, 'save');
    optimizer.saveCache();
    expect(saveSpy).toHaveBeenCalledTimes(1);

    const cacheClearSpy = vi.spyOn(priv.cache, 'clear');
    const lazyClearSpy = vi.spyOn(priv.lazyLoader, 'clear');
    optimizer.clear();
    expect(cacheClearSpy).toHaveBeenCalledTimes(1);
    expect(lazyClearSpy).toHaveBeenCalledTimes(1);
    expect(optimizer.getStats().hitRate).toBe('0.0%');
  });

  it('generateWithCache hits cache and skips generator', async () => {
    existsSync.mockReturnValue(false);
    const { PerformanceOptimizer } = await loadOptimizer('opt-hit');
    const optimizer = new PerformanceOptimizer();

    const priv = optimizer as unknown as {
      cache: {
        get: (t: string, p: Record<string, unknown>) => string | null;
        set: (t: string, p: Record<string, unknown>, code: string) => void;
        getStats: () => { size: number; keys: string[] };
      };
    };

    vi.spyOn(priv.cache, 'get').mockReturnValue('{"ok":true}');
    vi.spyOn(priv.cache, 'getStats').mockReturnValue({ size: 0, keys: [] });

    const gen = vi.fn(async () => ({ ok: false }));
    const result = await optimizer.generateWithCache('t', { a: 1 }, gen);
    expect(result).toEqual({ ok: true });
    expect(gen).not.toHaveBeenCalled();

    expect(optimizer.getStats().hitRate).toBe('100.0%');
  });

  it('generateWithCache misses, measures duration, caches result, and generateInParallel branches', async () => {
    existsSync.mockReturnValue(false);
    const { PerformanceOptimizer, ParallelGenerator } = await loadOptimizer('opt-miss');
    const optimizer = new PerformanceOptimizer();

    const priv = optimizer as unknown as {
      cache: {
        get: (t: string, p: Record<string, unknown>) => string | null;
        set: (t: string, p: Record<string, unknown>, code: string) => void;
        getStats: () => { size: number; keys: string[] };
      };
      lazyLoader: { preload: (paths: string[]) => Promise<void> };
    };

    vi.spyOn(priv.cache, 'get').mockReturnValue(null);
    const setSpy = vi.spyOn(priv.cache, 'set');
    vi.spyOn(priv.cache, 'getStats').mockReturnValue({ size: 0, keys: [] });

    const nowSpy = vi
      .spyOn(performance, 'now')
      .mockImplementationOnce(() => 0)
      .mockImplementationOnce(() => 5);

    const result = await optimizer.generateWithCache('t', { a: 1 }, async () => ({ n: 1 }));
    expect(result).toEqual({ n: 1 });
    expect(setSpy).toHaveBeenCalledWith('t', { a: 1 }, '{"n":1}');
    expect(optimizer.getStats().estimatedSavedTime).toBe('5.00ms');

    nowSpy.mockRestore();

    // generateInParallel: runAll path
    const all = await optimizer.generateInParallel([async () => 1, async () => 2]);
    expect(all).toEqual([1, 2]);

    // generateInParallel: runBatch path
    const batchSpy = vi.spyOn(ParallelGenerator, 'runBatch');
    const batched = await optimizer.generateInParallel(
      [async () => 1, async () => 2, async () => 3],
      2
    );
    expect(batched).toEqual([1, 2, 3]);
    expect(batchSpy).toHaveBeenCalledTimes(1);

    // preloadModules
    const preloadSpy = vi.spyOn(priv.lazyLoader, 'preload').mockResolvedValue(undefined);
    await optimizer.preloadModules(['node:os']);
    expect(preloadSpy).toHaveBeenCalledWith(['node:os']);
  });
});
