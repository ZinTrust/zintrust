/**
 * Benchmarking Suite - Performance Measurement Tools
 * Measures code generation, memory usage, and overall performance
 */

import * as fs from 'node:fs';

export interface BenchmarkResult {
  name: string;
  duration: number; // milliseconds
  memoryBefore: number; // bytes
  memoryAfter: number; // bytes
  memoryDelta: number; // bytes
  iterationCount: number;
  averageTime: number; // ms per iteration
  averageMemory: number; // bytes per iteration
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

export interface BenchmarkSuite {
  name: string;
  results: BenchmarkResult[];
  totalDuration: number;
  startTime: Date;
  endTime: Date;
}

export interface OperationComparison {
  name: string;
  timeChange: number; // percentage
  memoryChange: number; // percentage
  timeFaster: boolean;
  memoryLower: boolean;
}

export interface ComparisonResult {
  timestamp: Date;
  comparisons: OperationComparison[];
  overallImprovement: number; // percentage
}

export interface IBenchmark {
  measure<T>(
    name: string,
    fn: () => T,
    iterations?: number,
    metadata?: Record<string, unknown>
  ): BenchmarkResult;
  measureAsync<T>(
    name: string,
    fn: () => Promise<T>,
    iterations?: number,
    metadata?: Record<string, unknown>
  ): Promise<BenchmarkResult>;
  getResults(): BenchmarkResult[];
  getTable(): string;
  toJSON(): BenchmarkSuite;
  export(filePath: string): void;
  compare(previous: BenchmarkSuite): ComparisonResult;
  getComparisonReport(comparison: ComparisonResult): string;
}

/**
 * Benchmark - Measure performance of operations
 * Sealed namespace for immutability
 */
export const Benchmark = Object.freeze({
  /**
   * Create a new benchmark instance
   */
  create(name: string = 'Benchmark Suite'): IBenchmark {
    const results: BenchmarkResult[] = [];
    const suiteName = name;
    const startTime = new Date();

    return {
      measure<T>(
        name: string,
        fn: () => T,
        iterations: number = 1,
        metadata?: Record<string, unknown>
      ): BenchmarkResult {
        const result = runMeasure(name, fn, iterations, metadata);
        results.push(result);
        return result;
      },

      async measureAsync<T>(
        name: string,
        fn: () => Promise<T>,
        iterations: number = 1,
        metadata?: Record<string, unknown>
      ): Promise<BenchmarkResult> {
        const result = await runMeasureAsync(name, fn, iterations, metadata);
        results.push(result);
        return result;
      },

      getResults: (): BenchmarkResult[] => [...results],
      getTable: (): string => getFormattedTable(results),
      toJSON: (): BenchmarkSuite => getBenchmarkSuite(suiteName, startTime, results),
      export(filePath: string): void {
        fs.writeFileSync(filePath, JSON.stringify(this.toJSON(), null, 2), 'utf-8');
      },
      compare: (previous: BenchmarkSuite): ComparisonResult => compareBenchmarks(results, previous),
      getComparisonReport: (comparison: ComparisonResult): string =>
        getFormattedComparisonReport(comparison),
    };
  },
});

/**
 * Run synchronous measurement
 */
function runMeasure<T>(
  name: string,
  fn: () => T,
  iterations: number,
  metadata?: Record<string, unknown>
): BenchmarkResult {
  const durations: number[] = [];
  const memBefore = process.memoryUsage().heapUsed;

  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    fn();
    const duration = performance.now() - start;
    durations.push(duration);
  }

  const memAfter = process.memoryUsage().heapUsed;
  const totalDuration = durations.reduce((a, b) => a + b, 0);

  return {
    name,
    duration: totalDuration,
    memoryBefore: memBefore,
    memoryAfter: memAfter,
    memoryDelta: memAfter - memBefore,
    iterationCount: iterations,
    averageTime: totalDuration / iterations,
    averageMemory: (memAfter - memBefore) / iterations,
    timestamp: new Date(),
    metadata,
  };
}

/**
 * Run asynchronous measurement
 */
async function runMeasureAsync<T>(
  name: string,
  fn: () => Promise<T>,
  iterations: number,
  metadata?: Record<string, unknown>
): Promise<BenchmarkResult> {
  const durations: number[] = [];
  const memBefore = process.memoryUsage().heapUsed;

  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await fn();
    const duration = performance.now() - start;
    durations.push(duration);
  }

  const memAfter = process.memoryUsage().heapUsed;
  const totalDuration = durations.reduce((a, b) => a + b, 0);

  return {
    name,
    duration: totalDuration,
    memoryBefore: memBefore,
    memoryAfter: memAfter,
    memoryDelta: memAfter - memBefore,
    iterationCount: iterations,
    averageTime: totalDuration / iterations,
    averageMemory: (memAfter - memBefore) / iterations,
    timestamp: new Date(),
    metadata,
  };
}

/**
 * Compare benchmarks
 */
function compareBenchmarks(results: BenchmarkResult[], previous: BenchmarkSuite): ComparisonResult {
  const comparisons: OperationComparison[] = [];

  for (const current of results) {
    const prev = previous.results.find((r) => r.name === current.name);
    if (!prev) {
      continue;
    }

    const timeChange = ((current.averageTime - prev.averageTime) / prev.averageTime) * 100;
    const memChange = ((current.averageMemory - prev.averageMemory) / prev.averageMemory) * 100;

    comparisons.push({
      name: current.name,
      timeChange,
      memoryChange: memChange,
      timeFaster: timeChange < 0,
      memoryLower: memChange < 0,
    });
  }

  return {
    timestamp: new Date(),
    comparisons,
    overallImprovement: calculateOverallImprovement(comparisons),
  };
}

/**
 * Calculate overall improvement percentage
 */
function calculateOverallImprovement(comparisons: OperationComparison[]): number {
  if (comparisons.length === 0) {
    return 0;
  }

  const avgChange = comparisons.reduce((sum, c) => sum + c.timeChange, 0) / comparisons.length;
  return -avgChange; // Negative change = improvement
}

/**
 * Get results as formatted table
 */
function getFormattedTable(results: BenchmarkResult[]): string {
  if (results.length === 0) {
    return 'No benchmark results';
  }

  const rows = [
    ['Operation', 'Iterations', 'Total (ms)', 'Avg (ms)', 'Memory Δ (KB)', 'Avg Mem (KB)'],
    [
      '-'.repeat(15),
      '-'.repeat(11),
      '-'.repeat(12),
      '-'.repeat(10),
      '-'.repeat(13),
      '-'.repeat(13),
    ],
  ];

  for (const result of results) {
    rows.push([
      result.name.padEnd(15),
      result.iterationCount.toString().padEnd(11),
      result.duration.toFixed(2).padEnd(12),
      result.averageTime.toFixed(2).padEnd(10),
      (result.memoryDelta / 1024).toFixed(1).padEnd(13),
      (result.averageMemory / 1024).toFixed(1).padEnd(13),
    ]);
  }

  return rows.map((row) => row.join(' ')).join('\n');
}

/**
 * Get formatted comparison report
 */
function getFormattedComparisonReport(comparison: ComparisonResult): string {
  const lines = [
    '=== Performance Comparison Report ===\n',
    `Overall Improvement: ${comparison.overallImprovement > 0 ? '+' : ''}${comparison.overallImprovement.toFixed(1)}%\n`,
    'Operation Comparisons:',
    '-'.repeat(60),
  ];

  for (const comp of comparison.comparisons) {
    const timeEmoji = comp.timeFaster ? '🟢' : '🔴';
    const memEmoji = comp.memoryLower ? '🟢' : '🔴';
    const timeLine = `${timeEmoji} ${comp.name}: ${comp.timeChange > 0 ? '+' : ''}${comp.timeChange.toFixed(1)}% time`;
    const memLine = `${memEmoji} Memory: ${comp.memoryChange > 0 ? '+' : ''}${comp.memoryChange.toFixed(1)}% usage`;

    lines.push(`\n${comp.name}`, `  Time: ${timeLine}`, `  ${memLine}`);
  }

  return lines.join('\n');
}

/**
 * Get benchmark suite as JSON
 */
function getBenchmarkSuite(
  name: string,
  startTime: Date,
  results: BenchmarkResult[]
): BenchmarkSuite {
  const endTime = new Date();
  const totalDuration = endTime.getTime() - startTime.getTime();

  return {
    name,
    results: [...results],
    totalDuration,
    startTime,
    endTime,
  };
}

export interface MemorySnapshot {
  timestamp: number;
  heapUsed: number;
  heapTotal: number;
  external: number;
  rss: number;
  arrayBuffers: number;
}

export interface MemoryStats {
  peakHeap: number;
  minHeap: number;
  avgHeap: number;
  peakRss: number;
  snapshots: number;
}

export interface IMemoryMonitor {
  start(intervalMs?: number): void;
  stop(): MemorySnapshot[];
  getStats(): MemoryStats;
  formatStats(): string;
}
/**
 * Memory Monitor - Track memory usage over time
 * Sealed namespace for immutability
 */
export const MemoryMonitor = Object.freeze({
  /**
   * Create a new memory monitor instance
   */
  create(): IMemoryMonitor {
    let snapshots: MemorySnapshot[] = [];
    let interval: ReturnType<typeof setInterval> | null = null;

    /**
     * Format bytes as human-readable
     */
    const formatBytes = (bytes: number): string => {
      const units = ['B', 'KB', 'MB', 'GB'];
      let size = bytes;
      let unitIndex = 0;

      while (size > 1024 && unitIndex < units.length - 1) {
        size /= 1024;
        unitIndex++;
      }

      return `${size.toFixed(2)} ${units[unitIndex]}`;
    };

    return {
      /**
       * Start monitoring
       */
      start(intervalMs: number = 100): void {
        if (interval) {
          clearInterval(interval);
        }

        snapshots = [];
        const MAX_SNAPSHOTS = 10000; // Limit to 10,000 snapshots (~1MB)

        interval = setInterval(() => {
          const mem = process.memoryUsage();
          snapshots.push({
            timestamp: Date.now(),
            heapUsed: mem.heapUsed,
            heapTotal: mem.heapTotal,
            external: mem.external,
            rss: mem.rss,
            arrayBuffers: mem.arrayBuffers || 0,
          });

          // Prevent unbounded growth
          if (snapshots.length > MAX_SNAPSHOTS) {
            snapshots.shift();
          }
        }, intervalMs);
      },

      /**
       * Stop monitoring
       */
      stop(): MemorySnapshot[] {
        if (interval) {
          clearInterval(interval);
          interval = null;
        }
        return [...snapshots];
      },

      /**
       * Get memory statistics
       */
      getStats(): MemoryStats {
        return calculateMemoryStats(snapshots);
      },

      /**
       * Format memory stats as string
       */
      formatStats(): string {
        const stats = this.getStats();
        return formatMemoryStats(stats, formatBytes);
      },
    };
  },
});

/**
 * Calculate memory statistics
 */
function calculateMemoryStats(snapshots: MemorySnapshot[]): MemoryStats {
  if (snapshots.length === 0) {
    return {
      peakHeap: 0,
      minHeap: 0,
      avgHeap: 0,
      peakRss: 0,
      snapshots: 0,
    };
  }

  const heapUsages = snapshots.map((s) => s.heapUsed);
  const rssUsages = snapshots.map((s) => s.rss);

  return {
    peakHeap: Math.max(...heapUsages),
    minHeap: Math.min(...heapUsages),
    avgHeap: heapUsages.reduce((a, b) => a + b, 0) / heapUsages.length,
    peakRss: Math.max(...rssUsages),
    snapshots: snapshots.length,
  };
}

/**
 * Format memory statistics
 */
function formatMemoryStats(stats: MemoryStats, formatBytes: (bytes: number) => string): string {
  return [
    'Memory Statistics:',
    `  Peak Heap: ${formatBytes(stats.peakHeap)}`,
    `  Min Heap: ${formatBytes(stats.minHeap)}`,
    `  Avg Heap: ${formatBytes(stats.avgHeap)}`,
    `  Peak RSS: ${formatBytes(stats.peakRss)}`,
    `  Snapshots: ${stats.snapshots}`,
  ].join('\n');
}
