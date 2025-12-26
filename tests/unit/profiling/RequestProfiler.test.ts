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
  N1Detector: {
    create: vi.fn(() => ({
      detect: vi.fn().mockReturnValue([]),
    })),
  },
}));

vi.mock('@/profiling/MemoryProfiler', () => ({
  MemoryProfiler: {
    create: vi.fn(() => ({
      start: vi.fn(),
      end: vi.fn(),
      delta: vi.fn().mockReturnValue({
        heapUsed: 100,
        heapTotal: 100,
        external: 0,
        rss: 0,
      }),
    })),
    formatBytes: vi.fn((bytes) => `${bytes} B`),
  },
}));

describe('RequestProfiler', () => {
  it('should capture request metrics', async () => {
    const profiler = RequestProfiler.create();
    const fn = vi.fn().mockResolvedValue(true);

    const report = await profiler.captureRequest(fn);

    expect(fn).toHaveBeenCalled();
    expect(report.duration).toBeGreaterThanOrEqual(0);
    expect(report.queriesExecuted).toBe(0);
    expect(report.n1Patterns).toEqual([]);
    expect(report.memoryDelta).toBeDefined();
  });

  it('should include N+1 patterns in generated report when detected', async () => {
    const profiler = RequestProfiler.create();

    const queryLogger = profiler.getQueryLogger() as unknown as {
      getQueryLog: ReturnType<typeof vi.fn>;
    };
    queryLogger.getQueryLog.mockReturnValue([
      {
        sql: 'SELECT * FROM users WHERE id = ?',
        params: [1],
        duration: 1,
        timestamp: new Date('2020-01-01T00:00:00.000Z'),
        context: 'profiling',
      },
    ]);

    const detector = profiler.getN1Detector() as unknown as {
      detect: ReturnType<typeof vi.fn>;
    };
    detector.detect.mockReturnValue([
      {
        table: 'users',
        queryCount: 5,
        query: 'SELECT * FROM users WHERE id = ?',
        severity: 'warning',
      },
    ]);

    const report = await profiler.captureRequest(async () => {});
    const text = profiler.generateReport(report);

    expect(text).toContain('N+1 Patterns:');
    expect(text).toContain('[WARNING] "users": 5x');
  });

  it('should end profiling even when request throws', async () => {
    const profiler = RequestProfiler.create();
    const memoryProfiler = profiler.getMemoryProfiler() as unknown as {
      start: ReturnType<typeof vi.fn>;
      end: ReturnType<typeof vi.fn>;
    };

    const nowSpy = vi.spyOn(Date, 'now').mockReturnValueOnce(100).mockReturnValueOnce(150);

    try {
      await expect(
        profiler.captureRequest(async () => {
          throw new Error('boom');
        })
      ).rejects.toThrow('boom');
    } finally {
      nowSpy.mockRestore();
    }

    expect(memoryProfiler.start).toHaveBeenCalledTimes(1);
    expect(memoryProfiler.end).toHaveBeenCalledTimes(1);
  });

  it('should generate report', async () => {
    const profiler = RequestProfiler.create();
    const report = await profiler.captureRequest(async () => {});
    const text = profiler.generateReport(report);

    expect(text).toContain('=== Performance Profile Report ===');
    expect(text).toContain('Timing:');
    expect(text).toContain('Queries:');
    expect(text).toContain('Memory Delta:');
  });

  it('should expose internal tools', () => {
    const profiler = RequestProfiler.create();
    expect(profiler.getQueryLogger()).toBeDefined();
    expect(profiler.getN1Detector()).toBeDefined();
    expect(profiler.getMemoryProfiler()).toBeDefined();
  });
});
