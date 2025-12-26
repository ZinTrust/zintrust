import { fs } from '@node-singletons';
import * as os from '@node-singletons/os';
import * as path from '@node-singletons/path';

import {
  Benchmark,
  MemoryMonitor,
  type BenchmarkSuite,
  type ComparisonResult,
} from '@/performance/Benchmark';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Benchmark', () => {
  it('measures sync operations, stores results, and renders a table', () => {
    const now = vi
      .spyOn(performance, 'now')
      .mockImplementationOnce(() => 0)
      .mockImplementationOnce(() => 5)
      .mockImplementationOnce(() => 5)
      .mockImplementationOnce(() => 15);

    const mem = vi
      .spyOn(process, 'memoryUsage')
      .mockReturnValueOnce({
        rss: 1,
        heapTotal: 1,
        heapUsed: 1000,
        external: 1,
        arrayBuffers: 1,
      })
      .mockReturnValueOnce({
        rss: 1,
        heapTotal: 1,
        heapUsed: 2000,
        external: 1,
        arrayBuffers: 1,
      });

    const benchmark = Benchmark.create('Test Suite');
    const result = benchmark.measure('sync', () => 123, 2, { feature: 'x' });

    expect(result.name).toBe('sync');
    expect(result.iterationCount).toBe(2);
    expect(result.duration).toBe(15);
    expect(result.averageTime).toBe(7.5);
    expect(result.memoryBefore).toBe(1000);
    expect(result.memoryAfter).toBe(2000);
    expect(result.memoryDelta).toBe(1000);
    expect(result.averageMemory).toBe(500);
    expect(result.metadata).toEqual({ feature: 'x' });

    expect(benchmark.getResults()).toHaveLength(1);

    const table = benchmark.getTable();
    expect(table).toContain('Operation');
    expect(table).toContain('sync');

    expect(now).toHaveBeenCalledTimes(4);
    expect(mem).toHaveBeenCalledTimes(2);
  });

  it('returns a helpful message when no results exist', () => {
    const benchmark = Benchmark.create('Empty');
    expect(benchmark.getTable()).toBe('No benchmark results');
  });

  it('measures async operations and exports JSON', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2020-01-01T00:00:00.000Z'));

    vi.spyOn(performance, 'now')
      .mockImplementationOnce(() => 0)
      .mockImplementationOnce(() => 3);

    vi.spyOn(process, 'memoryUsage')
      .mockReturnValueOnce({
        rss: 1,
        heapTotal: 1,
        heapUsed: 10,
        external: 1,
        arrayBuffers: 1,
      })
      .mockReturnValueOnce({
        rss: 1,
        heapTotal: 1,
        heapUsed: 14,
        external: 1,
        arrayBuffers: 1,
      });

    const benchmark = Benchmark.create('Suite A');
    const result = await benchmark.measureAsync('async', async () => 1, 1);
    expect(result.duration).toBe(3);

    vi.setSystemTime(new Date('2020-01-01T00:00:01.000Z'));
    const json = benchmark.toJSON();
    expect(json.name).toBe('Suite A');
    expect(json.results).toHaveLength(1);
    expect(json.totalDuration).toBe(1000);
    expect(json.startTime).toBeInstanceOf(Date);
    expect(json.endTime).toBeInstanceOf(Date);

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zintrust-benchmark-'));
    const outPath = path.join(tmpDir, 'bench.json');
    benchmark.export(outPath);
    const written = fs.readFileSync(outPath, 'utf-8');
    expect(written).toContain('"name": "Suite A"');
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('compares against a previous suite (including missing previous results)', () => {
    vi.spyOn(process, 'memoryUsage')
      .mockReturnValueOnce({
        rss: 1,
        heapTotal: 1,
        heapUsed: 100,
        external: 1,
        arrayBuffers: 1,
      })
      .mockReturnValueOnce({
        rss: 1,
        heapTotal: 1,
        heapUsed: 200,
        external: 1,
        arrayBuffers: 1,
      });

    const benchmark = Benchmark.create('Suite');
    const fast = benchmark.measure('op-a', () => 1, 2);
    benchmark.measure('op-missing', () => 2, 2);

    const previous: BenchmarkSuite = {
      name: 'Previous',
      startTime: new Date('2020-01-01T00:00:00.000Z'),
      endTime: new Date('2020-01-01T00:00:01.000Z'),
      totalDuration: 1000,
      results: [
        {
          ...fast,
          averageTime: 10,
          averageMemory: 10,
        },
      ],
    };

    const comparison = benchmark.compare(previous);
    expect(comparison.comparisons).toHaveLength(1);
    expect(comparison.comparisons[0]?.name).toBe('op-a');
    expect(comparison.comparisons[0]?.timeFaster).toBe(true);
    expect(comparison.comparisons[0]?.memoryLower).toBe(false);
    expect(typeof comparison.overallImprovement).toBe('number');
  });

  it('returns zero improvement when no comparable operations exist', () => {
    vi.spyOn(performance, 'now')
      .mockImplementationOnce(() => 0)
      .mockImplementationOnce(() => 1);

    vi.spyOn(process, 'memoryUsage')
      .mockReturnValueOnce({
        rss: 1,
        heapTotal: 1,
        heapUsed: 1,
        external: 1,
        arrayBuffers: 1,
      })
      .mockReturnValueOnce({
        rss: 1,
        heapTotal: 1,
        heapUsed: 1,
        external: 1,
        arrayBuffers: 1,
      });

    const benchmark = Benchmark.create('Suite');
    benchmark.measure('only-current', () => 1);

    const previous: BenchmarkSuite = {
      name: 'Previous',
      startTime: new Date('2020-01-01T00:00:00.000Z'),
      endTime: new Date('2020-01-01T00:00:01.000Z'),
      totalDuration: 1000,
      results: [],
    };

    const comparison = benchmark.compare(previous);
    expect(comparison.comparisons).toHaveLength(0);
    expect(comparison.overallImprovement).toBe(0);
  });

  it('formats a comparison report for positive and negative overall improvement', () => {
    const benchmark = Benchmark.create('Suite');

    const positive: ComparisonResult = {
      timestamp: new Date('2020-01-01T00:00:00.000Z'),
      overallImprovement: 12.34,
      comparisons: [
        {
          name: 'op',
          timeChange: -1,
          memoryChange: 2,
          timeFaster: true,
          memoryLower: false,
        },
      ],
    };

    const negative: ComparisonResult = {
      ...positive,
      overallImprovement: -0.5,
      comparisons: [
        {
          name: 'op',
          timeChange: 1,
          memoryChange: -2,
          timeFaster: false,
          memoryLower: true,
        },
      ],
    };

    const reportPositive = benchmark.getComparisonReport(positive);
    expect(reportPositive).toContain('Overall Improvement: +12.3%');
    expect(reportPositive).toContain('Operation Comparisons:');
    expect(reportPositive).toContain('op');

    const reportNegative = benchmark.getComparisonReport(negative);
    expect(reportNegative).toContain('Overall Improvement: -0.5%');
    expect(reportNegative).toContain('Memory:');
  });
});

describe('MemoryMonitor', () => {
  it('returns zeros when no snapshots exist', () => {
    const monitor = MemoryMonitor.create();
    const stats = monitor.getStats();
    expect(stats.snapshots).toBe(0);
    expect(stats.peakHeap).toBe(0);
    expect(stats.minHeap).toBe(0);
    expect(stats.avgHeap).toBe(0);
    expect(stats.peakRss).toBe(0);

    const formatted = monitor.formatStats();
    expect(formatted).toContain('Memory Statistics:');
    expect(formatted).toContain('0.00 B');
  });

  it('captures snapshots on an interval and formats bytes across units', () => {
    vi.useFakeTimers();

    const memoryUsageSpy = vi.spyOn(process, 'memoryUsage').mockImplementation(() => {
      const callCount = memoryUsageSpy.mock.calls.length;

      let heapUsed = 5 * 1024 * 1024;
      if (callCount === 1) {
        heapUsed = 500;
      } else if (callCount === 2) {
        heapUsed = 2048;
      }
      const rss = 10 * 1024 * 1024;

      return {
        rss,
        heapTotal: heapUsed,
        heapUsed,
        external: 0,
        arrayBuffers: 0,
      };
    });

    const monitor = MemoryMonitor.create();
    monitor.start(100);
    vi.advanceTimersByTime(250);

    const snapshots = monitor.stop();
    expect(snapshots.length).toBe(2);

    const stats = monitor.getStats();
    expect(stats.snapshots).toBe(2);
    expect(stats.peakHeap).toBeGreaterThan(stats.minHeap);

    const formatted = monitor.formatStats();
    expect(formatted).toContain('Snapshots: 2');
    expect(formatted).toContain('B');
    expect(formatted).toContain('KB');
    expect(formatted).toContain('MB');

    // stop() is safe to call again (interval already cleared)
    const snapshotsAgain = monitor.stop();
    expect(snapshotsAgain.length).toBe(2);
  });
});
