import { RequestProfiler } from '@/profiling/RequestProfiler';
import { describe, expect, it, vi } from 'vitest';

// Mock dependencies
vi.mock('@/profiling/QueryLogger', () => ({
  QueryLogger: {
    getInstance: vi.fn(() => ({
      setContext: vi.fn(),
      getQueryLog: vi.fn().mockReturnValue([]),
    })),
  },
}));

vi.mock('@/profiling/N1Detector', () => ({
  N1Detector: class {
    detect = vi.fn().mockReturnValue([]);
  },
}));

vi.mock('@/profiling/MemoryProfiler', () => ({
  MemoryProfiler: class {
    start = vi.fn();
    end = vi.fn();
    delta = vi.fn().mockReturnValue({
      heapUsed: 100,
      heapTotal: 100,
      external: 0,
      rss: 0,
    });
    static readonly formatBytes = vi.fn((bytes) => `${bytes} B`);
  },
}));

describe('RequestProfiler', () => {
  it('should capture request metrics', async () => {
    const profiler = new RequestProfiler();
    const fn = vi.fn().mockResolvedValue(true);

    const report = await profiler.captureRequest(fn);

    expect(fn).toHaveBeenCalled();
    expect(report.duration).toBeGreaterThanOrEqual(0);
    expect(report.queriesExecuted).toBe(0);
    expect(report.n1Patterns).toEqual([]);
    expect(report.memoryDelta).toBeDefined();
  });

  it('should generate report', async () => {
    const profiler = new RequestProfiler();
    const report = await profiler.captureRequest(async () => {});
    const text = profiler.generateReport(report);

    expect(text).toContain('=== Performance Profile Report ===');
    expect(text).toContain('Timing:');
    expect(text).toContain('Queries:');
    expect(text).toContain('Memory Delta:');
  });

  it('should expose internal tools', () => {
    const profiler = new RequestProfiler();
    expect(profiler.getQueryLogger()).toBeDefined();
    expect(profiler.getN1Detector()).toBeDefined();
    expect(profiler.getMemoryProfiler()).toBeDefined();
  });
});
