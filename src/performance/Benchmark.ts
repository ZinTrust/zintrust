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

/**
 * Benchmark - Measure performance of operations
 */
export class Benchmark {
  private readonly results: BenchmarkResult[] = [];
  private readonly suiteName: string;
  private readonly startTime: Date = new Date();

  constructor(name: string = 'Benchmark Suite') {
    this.suiteName = name;
  }

  /**
   * Measure a synchronous operation
   */
  public measure<T>(
    name: string,
    fn: () => T,
    iterations: number = 1,
    metadata?: Record<string, unknown>
  ): BenchmarkResult {
    const results: number[] = [];
    const memBefore = process.memoryUsage().heapUsed;

    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      fn();
      const duration = performance.now() - start;
      results.push(duration);
    }

    const memAfter = process.memoryUsage().heapUsed;
    const totalDuration = results.reduce((a, b) => a + b, 0);

    const result: BenchmarkResult = {
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

    this.results.push(result);
    return result;
  }

  /**
   * Measure an async operation
   */
  public async measureAsync<T>(
    name: string,
    fn: () => Promise<T>,
    iterations: number = 1,
    metadata?: Record<string, unknown>
  ): Promise<BenchmarkResult> {
    const results: number[] = [];
    const memBefore = process.memoryUsage().heapUsed;

    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      await fn();
      const duration = performance.now() - start;
      results.push(duration);
    }

    const memAfter = process.memoryUsage().heapUsed;
    const totalDuration = results.reduce((a, b) => a + b, 0);

    const result: BenchmarkResult = {
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

    this.results.push(result);
    return result;
  }

  /**
   * Get all results
   */
  public getResults(): BenchmarkResult[] {
    return this.results;
  }

  /**
   * Get results as formatted table
   */
  public getTable(): string {
    if (this.results.length === 0) {
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

    for (const result of this.results) {
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
   * Get results as JSON
   */
  public toJSON(): BenchmarkSuite {
    const endTime = new Date();
    const totalDuration = endTime.getTime() - this.startTime.getTime();

    return {
      name: this.suiteName,
      results: this.results,
      totalDuration,
      startTime: this.startTime,
      endTime,
    };
  }

  /**
   * Export results to file
   */
  public export(filePath: string): void {
    const data = this.toJSON();
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  }

  /**
   * Compare with previous benchmark
   */
  public compare(previous: BenchmarkSuite): ComparisonResult {
    const comparisons: OperationComparison[] = [];

    for (const current of this.results) {
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
      overallImprovement: this.calculateOverallImprovement(comparisons),
    };
  }

  /**
   * Calculate overall improvement percentage
   */
  private calculateOverallImprovement(comparisons: OperationComparison[]): number {
    if (comparisons.length === 0) {
      return 0;
    }

    const avgChange = comparisons.reduce((sum, c) => sum + c.timeChange, 0) / comparisons.length;
    return -avgChange; // Negative change = improvement
  }

  /**
   * Get formatted comparison report
   */
  public getComparisonReport(comparison: ComparisonResult): string {
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

/**
 * Memory Monitor - Track memory usage over time
 */
export class MemoryMonitor {
  private snapshots: MemorySnapshot[] = [];
  private interval: ReturnType<typeof setInterval> | null = null;

  /**
   * Start monitoring
   */
  public start(intervalMs: number = 100): void {
    this.snapshots = [];
    this.interval = setInterval(() => {
      const mem = process.memoryUsage();
      this.snapshots.push({
        timestamp: Date.now(),
        heapUsed: mem.heapUsed,
        heapTotal: mem.heapTotal,
        external: mem.external,
        rss: mem.rss,
        arrayBuffers: mem.arrayBuffers || 0,
      });
    }, intervalMs);
  }

  /**
   * Stop monitoring
   */
  public stop(): MemorySnapshot[] {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    return this.snapshots;
  }

  /**
   * Get memory statistics
   */
  public getStats(): MemoryStats {
    if (this.snapshots.length === 0) {
      return {
        peakHeap: 0,
        minHeap: 0,
        avgHeap: 0,
        peakRss: 0,
        snapshots: 0,
      };
    }

    const heapUsages = this.snapshots.map((s) => s.heapUsed);
    const rssUsages = this.snapshots.map((s) => s.rss);

    return {
      peakHeap: Math.max(...heapUsages),
      minHeap: Math.min(...heapUsages),
      avgHeap: heapUsages.reduce((a, b) => a + b, 0) / heapUsages.length,
      peakRss: Math.max(...rssUsages),
      snapshots: this.snapshots.length,
    };
  }

  /**
   * Format memory stats as string
   */
  public formatStats(): string {
    const stats = this.getStats();
    return [
      'Memory Statistics:',
      `  Peak Heap: ${this.formatBytes(stats.peakHeap)}`,
      `  Min Heap: ${this.formatBytes(stats.minHeap)}`,
      `  Avg Heap: ${this.formatBytes(stats.avgHeap)}`,
      `  Peak RSS: ${this.formatBytes(stats.peakRss)}`,
      `  Snapshots: ${stats.snapshots}`,
    ].join('\n');
  }

  /**
   * Format bytes as human-readable
   */
  private formatBytes(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;

    while (size > 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(2)} ${units[unitIndex]}`;
  }
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
