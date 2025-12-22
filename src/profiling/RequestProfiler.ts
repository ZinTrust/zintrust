/**
 * Request Profiler
 * Comprehensive profiling of request execution combining query, N+1, and memory metrics
 */

import { MemoryProfiler } from '@profiling/MemoryProfiler';
import { N1Detector } from '@profiling/N1Detector';
import { QueryLogger, QueryLoggerInstance } from '@profiling/QueryLogger';
import { N1Pattern, ProfileReport } from '@profiling/types';

/**
 * RequestProfiler orchestrates query logging, N+1 detection, and memory profiling
 * Provides a unified interface for comprehensive request performance analysis
 */
export class RequestProfiler {
  private readonly queryLogger: QueryLoggerInstance;
  private readonly n1Detector: N1Detector;
  private readonly memoryProfiler: MemoryProfiler;
  private startTime: number = 0;
  private endTime: number = 0;

  constructor() {
    this.queryLogger = QueryLogger.getInstance();
    this.n1Detector = new N1Detector();
    this.memoryProfiler = new MemoryProfiler();
  }

  /**
   * Get query logger instance
   */
  public getQueryLogger(): QueryLoggerInstance {
    return this.queryLogger;
  }

  /**
   * Get N+1 detector instance
   */
  public getN1Detector(): N1Detector {
    return this.n1Detector;
  }

  /**
   * Get memory profiler instance
   */
  public getMemoryProfiler(): MemoryProfiler {
    return this.memoryProfiler;
  }

  /**
   * Capture request execution with full profiling
   * Wraps async function to measure performance metrics
   */
  public async captureRequest(fn: () => Promise<unknown>): Promise<ProfileReport> {
    // Start profiling
    this.startTime = Date.now();
    this.memoryProfiler.start();
    this.queryLogger.setContext('profiling');

    try {
      // Execute the request
      await fn();
    } finally {
      // End profiling
      this.endTime = Date.now();
      this.memoryProfiler.end();
    }

    // Gather profiling data
    const duration = this.endTime - this.startTime;
    const queryLog = this.queryLogger.getQueryLog('profiling');
    const queriesExecuted = queryLog.length;
    const n1Patterns = this.n1Detector.detect(queryLog);
    const memoryDelta = this.memoryProfiler.delta();

    return {
      duration,
      queriesExecuted,
      n1Patterns,
      memoryDelta,
      timestamp: new Date(),
    };
  }

  /**
   * Generate human-readable profile report
   */
  public generateReport(profile: ProfileReport): string {
    const n1Section = this.formatN1Section(profile.n1Patterns);

    const lines = [
      '=== Performance Profile Report ===',
      `\nTiming: ${profile.duration}ms`,
      `Queries: ${profile.queriesExecuted}`,
      ...n1Section,
      '\nMemory Delta:',
      `  Heap Used: ${MemoryProfiler.formatBytes(profile.memoryDelta.heapUsed)}`,
      `  Heap Total: ${MemoryProfiler.formatBytes(profile.memoryDelta.heapTotal)}`,
      `  External: ${MemoryProfiler.formatBytes(profile.memoryDelta.external)}`,
      `  RSS: ${MemoryProfiler.formatBytes(profile.memoryDelta.rss)}`,
    ];

    return lines.join('\n');
  }

  /**
   * Format N+1 section for report
   */
  private formatN1Section(patterns: N1Pattern[]): string[] {
    if (patterns.length === 0) {
      return ['\nN+1 Patterns: None detected'];
    }

    return [
      '\nN+1 Patterns:',
      ...patterns.map(
        (pattern) =>
          `  [${pattern.severity.toUpperCase()}] "${pattern.table}": ${pattern.queryCount}x`
      ),
    ];
  }
}

/**
 * Re-export MemoryProfiler's static formatBytes for convenience
 */
export { MemoryProfiler } from '@profiling/MemoryProfiler';
