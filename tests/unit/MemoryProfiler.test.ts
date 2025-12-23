import { IMemoryProfiler, MemoryProfiler, formatBytes } from '@profiling/MemoryProfiler';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type GlobalWithGc = typeof globalThis & { gc?: () => void };

describe('MemoryProfiler', () => {
  let profiler: IMemoryProfiler;
  const globalWithGc = globalThis as GlobalWithGc;
  const originalGc = globalWithGc.gc;

  beforeEach(() => {
    profiler = MemoryProfiler.create();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2020-01-01T00:00:00.000Z'));
  });

  afterEach(() => {
    globalWithGc.gc = originalGc;
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('start() calls gc when available and captures start snapshot', () => {
    const gc = vi.fn();
    globalWithGc.gc = gc;

    const memoryUsageSpy = vi.spyOn(process, 'memoryUsage');
    memoryUsageSpy.mockReturnValue({
      heapUsed: 100,
      heapTotal: 200,
      external: 10,
      rss: 300,
      arrayBuffers: 0,
    });

    profiler.start();

    expect(gc).toHaveBeenCalledTimes(1);
    expect(profiler.getStartSnapshot()).toEqual({
      heapUsed: 100,
      heapTotal: 200,
      external: 10,
      rss: 300,
      timestamp: new Date('2020-01-01T00:00:00.000Z'),
    });
    expect(profiler.getEndSnapshot()).toBeNull();
  });

  it('start() does not call gc when unavailable and clears a previous end snapshot', () => {
    globalWithGc.gc = undefined;

    const memoryUsageSpy = vi.spyOn(process, 'memoryUsage');
    memoryUsageSpy
      .mockReturnValueOnce({
        heapUsed: 10,
        heapTotal: 20,
        external: 1,
        rss: 30,
        arrayBuffers: 0,
      })
      .mockReturnValueOnce({
        heapUsed: 11,
        heapTotal: 21,
        external: 2,
        rss: 31,
        arrayBuffers: 0,
      });

    profiler.start();
    profiler.end();
    expect(profiler.getEndSnapshot()).not.toBeNull();

    profiler.start();
    expect(profiler.getEndSnapshot()).toBeNull();
  });

  it('delta() returns zeros before start/end are completed', () => {
    expect(profiler.delta()).toEqual({
      heapUsed: 0,
      heapTotal: 0,
      external: 0,
      rss: 0,
    });

    const memoryUsageSpy = vi.spyOn(process, 'memoryUsage');
    memoryUsageSpy.mockReturnValue({
      heapUsed: 1,
      heapTotal: 2,
      external: 3,
      rss: 4,
      arrayBuffers: 0,
    });
    profiler.start();

    expect(profiler.delta()).toEqual({
      heapUsed: 0,
      heapTotal: 0,
      external: 0,
      rss: 0,
    });
  });

  it('end() captures end snapshot and delta() computes differences', () => {
    const memoryUsageSpy = vi.spyOn(process, 'memoryUsage');
    memoryUsageSpy
      .mockReturnValueOnce({
        heapUsed: 100,
        heapTotal: 200,
        external: 10,
        rss: 300,
        arrayBuffers: 0,
      })
      .mockReturnValueOnce({
        heapUsed: 140,
        heapTotal: 240,
        external: 25,
        rss: 260,
        arrayBuffers: 0,
      });

    profiler.start();
    vi.setSystemTime(new Date('2020-01-01T00:00:01.000Z'));
    const endSnapshot = profiler.end();

    expect(profiler.getEndSnapshot()).toEqual(endSnapshot);
    expect(endSnapshot.timestamp).toEqual(new Date('2020-01-01T00:00:01.000Z'));
    expect(profiler.delta()).toEqual({
      heapUsed: 40,
      heapTotal: 40,
      external: 15,
      rss: -40,
    });
  });

  it('getReport() returns a message when not started/completed', () => {
    expect(profiler.getReport()).toBe('Memory profiling not started or completed');
  });

  it('getReport() formats a human-readable report when completed', () => {
    const memoryUsageSpy = vi.spyOn(process, 'memoryUsage');
    memoryUsageSpy
      .mockReturnValueOnce({
        heapUsed: 0,
        heapTotal: 1024,
        external: 0,
        rss: 1024 * 1024,
        arrayBuffers: 0,
      })
      .mockReturnValueOnce({
        heapUsed: 1024,
        heapTotal: 2 * 1024,
        external: 1024,
        rss: 0,
        arrayBuffers: 0,
      });

    profiler.start();
    profiler.end();

    const report = profiler.getReport();
    expect(report).toContain('Memory Profile Report:');
    expect(report).toContain('Heap Used: 1.00 KB');
    expect(report).toContain('Heap Total: 1.00 KB');
    expect(report).toContain('External: 1.00 KB');
    expect(report).toContain('RSS: -1.00 MB');
  });

  it('formatBytes covers zero, positive, and negative values', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1024)).toBe('1.00 KB');
    expect(formatBytes(-1024)).toBe('-1.00 KB');
    expect(MemoryProfiler.formatBytes(1024 * 1024)).toBe('1.00 MB');
  });
});
