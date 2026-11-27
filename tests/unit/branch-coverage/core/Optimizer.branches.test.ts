/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  access: vi.fn(async (_p: string) => undefined),
  mkdir: vi.fn(async (_p: string, _o?: unknown) => undefined),
  writeFile: vi.fn(async (_p: string, _d: string) => undefined),
  readdir: vi.fn(async (_p: string) => [] as string[]),
  readFile: vi.fn(async (_p: string) => '{bad json'),
  rm: vi.fn(async (_p: string, _o?: unknown) => undefined),
  stat: vi.fn(async (_p: string) => ({ size: 2048 })),
  unlink: vi.fn(async (_p: string) => undefined) as any,
  promisesUnlink: vi.fn(async (_p: string) => undefined) as any,
  callbackUnlink: undefined as
    | ((p: string, cb: (err: NodeJS.ErrnoException | null) => void) => void)
    | undefined,
  promisesThrows: false,
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('@config/logger', () => ({ Logger: state.logger }));

vi.mock('@node-singletons', () => {
  const getPromises = () => {
    if (state.promisesThrows) throw new Error('promises unavailable');
    return {
      access: state.access,
      mkdir: state.mkdir,
      writeFile: state.writeFile,
      readdir: state.readdir,
      readFile: state.readFile,
      rm: state.rm,
      stat: state.stat,
      unlink: state.promisesUnlink,
    };
  };

  return {
    fs: {
      get fsPromises() {
        return getPromises();
      },
      get promises() {
        return getPromises();
      },
      unlink: (p: string, cb: (err: NodeJS.ErrnoException | null) => void) => {
        if (state.callbackUnlink) return state.callbackUnlink(p, cb);
        cb(null);
      },
    },
  };
});

const STATE_SYMBOL = Symbol.for('zintrust:GenerationCacheState');

const resetFsMocks = (): void => {
  state.access.mockReset().mockResolvedValue(undefined);
  state.mkdir.mockReset().mockResolvedValue(undefined);
  state.writeFile.mockReset().mockResolvedValue(undefined);
  state.readdir.mockReset().mockResolvedValue([]);
  state.readFile.mockReset().mockResolvedValue('{bad json');
  state.rm.mockReset().mockResolvedValue(undefined);
  state.stat.mockReset().mockResolvedValue({ size: 2048 });
  state.unlink = vi.fn(async () => undefined);
  state.promisesUnlink = vi.fn(async () => undefined);
  state.callbackUnlink = undefined;
  state.promisesThrows = false;
  state.logger.error.mockReset();
  state.logger.warn.mockReset();
};

const loadModule = async () => {
  vi.resetModules();
  return import('@performance/Optimizer');
};

describe('Optimizer uncovered branches', () => {
  beforeEach(() => {
    resetFsMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('handles non-unrefable timers by stubbing global timer factories', async () => {
    const originalSetTimeout = globalThis.setTimeout;
    const originalSetInterval = globalThis.setInterval;
    vi.stubGlobal('setTimeout', () => 1 as any);
    vi.stubGlobal('setInterval', () => 2 as any);

    try {
      const { GenerationCache } = await loadModule();
      const cache = GenerationCache.create('/cache', 1000, 2);
      await cache.set('a', { x: 1 }, 'code');
      await cache.dispose();
    } finally {
      vi.stubGlobal('setTimeout', originalSetTimeout);
      vi.stubGlobal('setInterval', originalSetInterval);
    }
  });

  it('uses callback unlink and logs errors from the non-promise path', async () => {
    state.promisesUnlink = undefined;
    state.callbackUnlink = (_p, cb) => cb(Object.assign(new Error('nope'), { code: 'EACCES' }));

    const { GenerationCache } = await loadModule();
    const cache = GenerationCache.create('/cache', 0, 2);
    await cache.set('old', {}, 'old');
    const internal = (cache as any)[STATE_SYMBOL];
    for (const entry of internal.cache.values()) entry.timestamp = 0;

    await expect(cache.get('old', {})).resolves.toBeNull();
    expect(state.logger.error).toHaveBeenCalledWith(expect.stringContaining('Failed to delete cache file'));
  });

  it('ignores ENOENT on callback unlink and promise unlink', async () => {
    state.unlink = vi.fn(async () => {
      throw Object.assign(new Error('gone'), { code: 'ENOENT' });
    });
    state.callbackUnlink = (_p, cb) => cb(Object.assign(new Error('gone'), { code: 'ENOENT' }));

    const { GenerationCache } = await loadModule();
    const cache = GenerationCache.create('/cache', 0, 2);
    await cache.set('old', {}, 'old');
    const internal = (cache as any)[STATE_SYMBOL];
    for (const entry of internal.cache.values()) entry.timestamp = 0;

    await expect(cache.get('old', {})).resolves.toBeNull();
    expect(state.logger.error).not.toHaveBeenCalled();
  });

  it('logs promise unlink rejections that are not ENOENT', async () => {
    state.promisesUnlink = vi.fn(async () => {
      throw new Error('boom');
    });

    const { GenerationCache } = await loadModule();
    const cache = GenerationCache.create('/cache', 0, 2);
    await cache.set('old', {}, 'old');
    const internal = (cache as any)[STATE_SYMBOL];
    for (const entry of internal.cache.values()) entry.timestamp = 0;

    await expect(cache.get('old', {})).resolves.toBeNull();
    await new Promise((resolve) => setImmediate(resolve));
    expect(state.logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to delete cache file:')
    );
  });

  it('logs when reading the promises object throws', async () => {
    state.promisesThrows = true;

    const { GenerationCache } = await loadModule();
    const cache = GenerationCache.create('/cache', 0, 2);
    await cache.set('old', {}, 'old');
    const internal = (cache as any)[STATE_SYMBOL];
    for (const entry of internal.cache.values()) entry.timestamp = 0;

    await expect(cache.get('old', {})).resolves.toBeNull();
    expect(state.logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to schedule cache file deletion')
    );
  });

  it('evicts entries when maxEntries is exceeded and cleans up on the interval', async () => {
    vi.useFakeTimers();
    const { GenerationCache } = await loadModule();
    const cache = GenerationCache.create('/cache', 10, 1);

    await cache.set('a', { x: 1 }, 'A');
    await cache.set('b', { x: 2 }, 'B');

    expect(await cache.get('a', { x: 1 })).toBeNull();
    expect(await cache.get('b', { x: 2 })).toBe('B');

    const internal = (cache as any)[STATE_SYMBOL];
    internal.cache.set('stale', { code: 'stale', timestamp: Date.now() - 1000 });
    await vi.advanceTimersByTimeAsync(600000);
    expect(internal.cache.has('stale')).toBe(false);
    await cache.dispose();
  });

  it('flushes pending writes on the 50ms timer and handles write failures', async () => {
    vi.useFakeTimers();
    const { GenerationCache } = await loadModule();
    const cache = GenerationCache.create('/cache', 1000, 5);

    await cache.set('a', { x: 1 }, 'A');
    await vi.advanceTimersByTimeAsync(60);
    expect(state.writeFile).toHaveBeenCalled();

    state.writeFile.mockRejectedValueOnce(new Error('disk full'));
    await cache.set('b', { x: 2 }, 'B');
    await vi.advanceTimersByTimeAsync(60);
    await vi.advanceTimersByTimeAsync(0);
    expect(state.logger.error).toHaveBeenCalledWith(
      'Failed to flush generation cache writes',
      expect.any(Error)
    );
    await cache.dispose();
  });

  it('logs failures to ensure the cache directory before save', async () => {
    state.access.mockRejectedValue(new Error('missing'));
    state.mkdir.mockRejectedValue(new Error('denied'));

    const { GenerationCache } = await loadModule();
    const cache = GenerationCache.create('/cache', 1000, 5);
    await cache.set('a', { x: 1 }, 'A');

    await cache.save();
    expect(state.logger.error).toHaveBeenCalledWith(
      'Failed to ensure cache directory before flush',
      expect.any(Error)
    );
    expect(state.logger.error).toHaveBeenCalledWith(
      'Failed to save cache to disk',
      expect.any(Error)
    );
  });

  it('logs failures while removing the cache directory', async () => {
    state.access.mockResolvedValue(undefined);
    state.rm.mockRejectedValue(new Error('denied'));

    const { GenerationCache } = await loadModule();
    const cache = GenerationCache.create('/cache', 1000, 5);
    await cache.clear();

    expect(state.logger.error).toHaveBeenCalledWith('Failed to clear cache', expect.any(Error));
  });

  it('returns early from clear when the directory does not exist', async () => {
    state.access.mockRejectedValue(new Error('missing'));

    const { GenerationCache } = await loadModule();
    const cache = GenerationCache.create('/cache', 1000, 5);
    await cache.set('a', { x: 1 }, 'A');
    await cache.clear();

    expect(state.rm).not.toHaveBeenCalled();
    expect(state.logger.error).not.toHaveBeenCalled();
  });

  it('ignores corrupted disk files and computes stats when files are present', async () => {
    state.access.mockResolvedValue(undefined);
    state.readdir.mockResolvedValue(['a.json', 'b.txt']);
    state.readFile.mockResolvedValueOnce('{"code":"C","timestamp":1}').mockResolvedValueOnce('{bad');

    const { GenerationCache } = await loadModule();
    const cache = GenerationCache.create('/cache', 100000, 5);
    await new Promise((resolve) => setImmediate(resolve));

    expect(await cache.get('a', {})).toBeNull();
    const stats = await cache.getStats();
    expect(stats.entries).toBe(1);
    expect(stats.diskUsage).toBe('4.00 KB');
  });

  it('falls back to zero disk usage when stat fails', async () => {
    state.access.mockResolvedValue(undefined);
    state.readdir.mockResolvedValue(['a.json']);
    state.stat.mockRejectedValue(new Error('stat failed'));

    const { GenerationCache } = await loadModule();
    const cache = GenerationCache.create('/cache', 100000, 5);
    const stats = await cache.getStats();

    expect(stats.diskUsage).toBe('0.00 B');
  });

  it('memoizes complex arguments, custom keys, TTL expiry and LRU eviction', async () => {
    vi.useFakeTimers();
    const { createMemoized } = await loadModule();

    const fn = vi.fn((a: unknown) => a);
    const memo = createMemoized(fn, { maxSize: 1 });
    const arg = { a: 1 };
    expect(memo(arg)).toEqual({ a: 1 });
    expect(memo(arg)).toEqual({ a: 1 });
    expect(fn).toHaveBeenCalledTimes(1);

    memo({ a: 2 });
    expect(memo({ a: 3 })).toEqual({ a: 3 });
    expect(fn).toHaveBeenCalledTimes(3);

    const keyedFn = vi.fn((a: number) => a * 2);
    const keyed = createMemoized(keyedFn, { keyGenerator: ([a]) => `k-${a}` });
    expect(keyed(2)).toBe(4);
    expect(keyed(2)).toBe(4);
    expect(keyedFn).toHaveBeenCalledTimes(1);

    const ttlFn = vi.fn((a: number) => a);
    const ttl = createMemoized(ttlFn, { ttl: 10 });
    expect(ttl(1)).toBe(1);
    await vi.advanceTimersByTimeAsync(20);
    expect(ttl(1)).toBe(1);
    expect(ttlFn).toHaveBeenCalledTimes(2);
  });

  it('covers generateWithCache hit, miss and unparseable cache paths', async () => {
    const { PerformanceOptimizer } = await loadModule();
    const optimizer = PerformanceOptimizer.create();

    const generator = vi.fn(async () => ({ ok: true }));
    expect(await optimizer.generateWithCache('t', { a: 1 }, generator)).toEqual({ ok: true });
    expect(await optimizer.generateWithCache('t', { a: 1 }, generator)).toEqual({ ok: true });
    expect(generator).toHaveBeenCalledTimes(1);

    const badGenerator = vi.fn(async () => ({ toJSON: () => undefined }));
    await optimizer.generateWithCache('bad', { a: 1 }, badGenerator);
    await optimizer.generateWithCache('bad', { a: 1 }, badGenerator);
    expect(state.logger.warn).toHaveBeenCalledWith(
      'Failed to parse cached generation result; treating as cache miss',
      expect.any(Object)
    );

    expect(await optimizer.generateInParallel([async () => 1, async () => 2], 1)).toEqual([1, 2]);
    expect(optimizer.getStats().cacheStatus.size).toBeGreaterThan(0);
    optimizer.saveCache();
    optimizer.clear();
  });
});
