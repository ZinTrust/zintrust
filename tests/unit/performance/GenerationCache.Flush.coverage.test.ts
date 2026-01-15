/* eslint-disable max-nested-callbacks */
import { mkdtemp, rm } from '@node-singletons/fs';
import { tmpdir } from '@node-singletons/os';
import { join } from '@node-singletons/path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const STATE_SYMBOL = Symbol.for('zintrust:GenerationCacheState');

describe('GenerationCache flush coverage', () => {
  let tmp: string | undefined;

  beforeAll(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'gen-cache-flush-'));
  });

  afterAll(async () => {
    if (tmp) await rm(tmp, { recursive: true, force: true });
    tmp = undefined;
  });

  it('flushes pending writes on timer', async () => {
    if (!tmp) throw new Error('tmp missing');

    vi.useFakeTimers();
    const { GenerationCache } = await import('@performance/Optimizer');
    const cache = GenerationCache.create(tmp, 60 * 1000, 10);

    await cache.set('t', { a: 1 }, 'code');

    await vi.advanceTimersByTimeAsync(60);

    const stats = await cache.getStats();
    expect(stats.entries).toBe(1);

    const internal = (cache as any)[STATE_SYMBOL] as {
      flushTimer?: unknown;
      pendingWrites?: Map<string, unknown>;
    };
    expect(internal.pendingWrites?.size ?? 0).toBe(0);
    expect(internal.flushTimer).toBeUndefined();

    vi.useRealTimers();
  });

  it('logs when ensureCacheDir fails during flush', async () => {
    vi.resetModules();

    const loggerError = vi.fn();

    vi.doMock('@config/logger', () => ({
      Logger: {
        error: loggerError,
        info: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn(),
      },
    }));

    vi.doMock('@node-singletons', async () => ({
      fs: {
        fsPromises: {
          access: vi.fn(async () => {
            throw new Error('no access');
          }),
          mkdir: vi.fn(async () => {
            throw new Error('no mkdir');
          }),
          writeFile: vi.fn(async () => undefined),
          readdir: vi.fn(async () => []),
          readFile: vi.fn(async () => ''),
          rm: vi.fn(async () => undefined),
          stat: vi.fn(async () => ({ size: 0 })),
        },
        existsSync: vi.fn(() => false),
        mkdirSync: vi.fn(),
        writeFileSync: vi.fn(),
        rmSync: vi.fn(),
        readdirSync: vi.fn(() => []),
        statSync: vi.fn(() => ({ size: 0 })),
        readFileSync: vi.fn(() => ''),
      },
      path: await import('@node-singletons/path'),
    }));

    const { GenerationCache } = await import('@performance/Optimizer');

    const cache = GenerationCache.create('/cache', 1000, 10);
    await cache.set('t', { a: 1 }, 'code');

    await cache.save();

    expect(loggerError).toHaveBeenCalledWith(
      'Failed to ensure cache directory before flush',
      expect.any(Error)
    );
  });
});
