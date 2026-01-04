/* eslint-disable max-nested-callbacks */

import { afterEach, describe, expect, it, vi } from 'vitest';

describe('Optimizer GenerationCache more coverage', () => {
  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('covers deleteFileNonBlocking via fs.promises.unlink (ENOENT ignored, other errors logged) and unref', async () => {
    vi.resetModules();

    const loggerError = vi.fn();

    const originalSetInterval = globalThis.setInterval;
    const originalClearInterval = globalThis.clearInterval;

    const unref = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).setInterval = vi.fn(() => ({ unref })) as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).clearInterval = vi.fn() as any;

    const unlink = vi
      .fn<[{ (p: string): Promise<void> }][0]>()
      .mockRejectedValueOnce({ code: 'ENOENT' })
      .mockRejectedValueOnce({ code: 'EACCES', message: 'nope' });

    vi.doMock('@config/logger', () => ({
      Logger: {
        error: loggerError,
        info: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn(),
      },
    }));

    vi.doMock('@node-singletons', () => ({
      fs: {
        existsSync: vi.fn(() => false),
        mkdirSync: vi.fn(),
        writeFileSync: vi.fn(),
        rmSync: vi.fn(),
        readdirSync: vi.fn(() => []),
        statSync: vi.fn(() => ({ size: 0 })),
        readFileSync: vi.fn(() => ''),
        promises: {
          unlink,
        },
      },
    }));

    const { GenerationCache } = await import('@performance/Optimizer');

    const nowSpy = vi.spyOn(Date, 'now');

    const cache = GenerationCache.create('/cache', 1, 100);
    expect(unref).toHaveBeenCalled();

    nowSpy.mockReturnValue(0);
    cache.set('t', { a: 1 }, 'code');
    nowSpy.mockReturnValue(1000);

    // Trigger TTL eviction -> deleteFileNonBlocking (ENOENT ignored)
    expect(cache.get('t', { a: 1 })).toBeNull();
    await Promise.resolve();
    expect(loggerError).not.toHaveBeenCalled();

    // Trigger another TTL eviction -> deleteFileNonBlocking (non-ENOENT logs)
    nowSpy.mockReturnValue(0);
    cache.set('t2', { b: 2 }, 'code');
    nowSpy.mockReturnValue(1000);
    expect(cache.get('t2', { b: 2 })).toBeNull();
    await Promise.resolve();

    expect(loggerError).toHaveBeenCalledWith(
      expect.stringContaining('Failed to delete cache file')
    );

    // Restore globals
    globalThis.setInterval = originalSetInterval;
    globalThis.clearInterval = originalClearInterval;
  });

  it('covers deleteFileNonBlocking via fs.unlink callback and outer catch branch', async () => {
    vi.resetModules();

    const loggerError = vi.fn();

    const originalSetInterval = globalThis.setInterval;
    const originalClearInterval = globalThis.clearInterval;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).setInterval = vi.fn(() => ({})) as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).clearInterval = vi.fn() as any;

    const unlinkCb = vi.fn((p: string, cb: (err: NodeJS.ErrnoException | null) => void) => {
      cb({
        name: 'Error',
        message: 'nope',
        code: 'EACCES',
      } as NodeJS.ErrnoException);
    });

    vi.doMock('@config/logger', () => ({
      Logger: {
        error: loggerError,
        info: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn(),
      },
    }));

    vi.doMock('@node-singletons', () => ({
      fs: {
        existsSync: vi.fn(() => false),
        mkdirSync: vi.fn(),
        writeFileSync: vi.fn(),
        rmSync: vi.fn(),
        readdirSync: vi.fn(() => []),
        statSync: vi.fn(() => ({ size: 0 })),
        readFileSync: vi.fn(() => ''),
        unlink: unlinkCb,
      },
    }));

    const { GenerationCache } = await import('@performance/Optimizer');

    const nowSpy = vi.spyOn(Date, 'now');

    const cache = GenerationCache.create('/cache', 1, 1);

    // Force eviction that hits fs.unlink callback path
    nowSpy.mockReturnValue(0);
    cache.set('x', { x: 1 }, 'code');
    cache.set('y', { y: 2 }, 'code');

    expect(unlinkCb).toHaveBeenCalled();

    expect(loggerError).toHaveBeenCalledWith(
      expect.stringContaining('Failed to delete cache file')
    );

    // Restore globals
    globalThis.setInterval = originalSetInterval;
    globalThis.clearInterval = originalClearInterval;
  });

  it('covers deleteFileNonBlocking outer catch branch', async () => {
    vi.resetModules();

    const loggerError = vi.fn();

    const originalSetInterval = globalThis.setInterval;
    const originalClearInterval = globalThis.clearInterval;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).setInterval = vi.fn(() => ({})) as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).clearInterval = vi.fn() as any;

    // Create a getter that throws to hit deleteFileNonBlocking outer catch
    const promisesWithThrowingGetter = {} as { unlink?: (p: string) => Promise<void> };
    Object.defineProperty(promisesWithThrowingGetter, 'unlink', {
      get() {
        throw new Error('getter boom');
      },
    });

    vi.doMock('@config/logger', () => ({
      Logger: {
        error: loggerError,
        info: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn(),
      },
    }));

    vi.doMock('@node-singletons', () => ({
      fs: {
        existsSync: vi.fn(() => false),
        mkdirSync: vi.fn(),
        writeFileSync: vi.fn(),
        rmSync: vi.fn(),
        readdirSync: vi.fn(() => []),
        statSync: vi.fn(() => ({ size: 0 })),
        readFileSync: vi.fn(() => ''),
        promises: promisesWithThrowingGetter,
      },
    }));

    const { GenerationCache } = await import('@performance/Optimizer');

    const nowSpy = vi.spyOn(Date, 'now');

    const cache = GenerationCache.create('/cache', 1, 100);

    nowSpy.mockReturnValue(0);
    cache.set('t', { a: 1 }, 'code');
    nowSpy.mockReturnValue(1000);

    expect(cache.get('t', { a: 1 })).toBeNull();

    expect(loggerError).toHaveBeenCalledWith(
      expect.stringContaining('Failed to schedule cache file deletion')
    );

    // Restore globals
    globalThis.setInterval = originalSetInterval;
    globalThis.clearInterval = originalClearInterval;
  });

  it('covers periodic cleanup interval callback (TTL eviction)', async () => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(0);

    const loggerError = vi.fn();
    const unlink = vi.fn(async () => undefined);

    vi.doMock('@config/logger', () => ({
      Logger: {
        error: loggerError,
        info: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn(),
      },
    }));

    vi.doMock('@node-singletons', () => ({
      fs: {
        existsSync: vi.fn(() => false),
        mkdirSync: vi.fn(),
        writeFileSync: vi.fn(),
        rmSync: vi.fn(),
        readdirSync: vi.fn(() => []),
        statSync: vi.fn(() => ({ size: 0 })),
        readFileSync: vi.fn(() => ''),
        promises: {
          unlink,
        },
      },
    }));

    const { GenerationCache } = await import('@performance/Optimizer');

    // Use high maxEntries so cache.set() doesn't evict immediately.
    const cache = GenerationCache.create('/cache', 1, 1000);

    cache.set('a', { a: 1 }, 'code-a');

    // Run the 10-min cleanup interval; at t=600000ms entry is expired.
    await vi.advanceTimersByTimeAsync(600000);

    expect(unlink).toHaveBeenCalled();

    // Cleanup interval should be cleared to avoid leaks.
    cache.clear();
  });

  it('covers periodic cleanup interval callback (maxEntries eviction)', async () => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(0);

    const unlink = vi.fn(async () => undefined);

    vi.doMock('@config/logger', () => ({
      Logger: {
        error: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn(),
      },
    }));

    vi.doMock('@node-singletons', () => ({
      fs: {
        existsSync: vi.fn(() => false),
        mkdirSync: vi.fn(),
        writeFileSync: vi.fn(),
        rmSync: vi.fn(),
        readdirSync: vi.fn(() => []),
        statSync: vi.fn(() => ({ size: 0 })),
        readFileSync: vi.fn(() => ''),
        promises: {
          unlink,
        },
      },
    }));

    const { GenerationCache } = await import('@performance/Optimizer');

    // ttl large so nothing expires; start with high maxEntries so set() doesn't evict.
    const cache = GenerationCache.create('/cache', 3600000, 1000);
    cache.set('a', { a: 1 }, 'code-a');
    cache.set('b', { b: 2 }, 'code-b');

    // Mutate internal state to force eviction inside the interval callback.
    const stateSymbol = Symbol.for('zintrust:GenerationCacheState');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const state = (cache as any)[stateSymbol] as { maxEntries?: number };
    state.maxEntries = 0;

    await vi.advanceTimersByTimeAsync(600000);

    expect(unlink).toHaveBeenCalled();
    cache.clear();
  });
});
