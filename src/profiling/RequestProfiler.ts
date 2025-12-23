/**
 * Request Profiler
 * Comprehensive profiling of request execution combining query, N+1, and memory metrics
 */

import { IMemoryProfiler, MemoryProfiler } from '@profiling/MemoryProfiler';
import { N1Detector } from '@profiling/N1Detector';
import { IQueryLogger, QueryLogger } from '@profiling/QueryLogger';
import { IN1Detector, N1Pattern, ProfileReport } from '@profiling/types';

export interface IRequestProfiler {
  getQueryLogger(): IQueryLogger;
  getN1Detector(): IN1Detector;
  getMemoryProfiler(): IMemoryProfiler;
  captureRequest(fn: () => Promise<unknown>): Promise<ProfileReport>;
  generateReport(profile: ProfileReport): string;
}

/**
 * RequestProfiler orchestrates query logging, N+1 detection, and memory profiling
 * Sealed namespace for immutability
 */
export const RequestProfiler = Object.freeze({
  /**
   * Create a new request profiler instance
   */
  create(): IRequestProfiler {
    const queryLogger = QueryLogger.getInstance();
    const n1Detector = N1Detector.create();
    const memoryProfiler = MemoryProfiler.create();
    let startTime: number = 0;
    let endTime: number = 0;

    return {
      getQueryLogger(): IQueryLogger {
        return queryLogger;
      },
      getN1Detector(): IN1Detector {
        return n1Detector;
      },
      getMemoryProfiler(): IMemoryProfiler {
        return memoryProfiler;
      },
      async captureRequest(fn: () => Promise<unknown>): Promise<ProfileReport> {
        // Start profiling
        startTime = Date.now();
        memoryProfiler.start();
        queryLogger.setContext('profiling');

        try {
          // Execute the request
          await fn();
        } finally {
          // End profiling
          endTime = Date.now();
          memoryProfiler.end();
        }

        // Gather profiling data
        const duration = endTime - startTime;
        const queryLog = queryLogger.getQueryLog('profiling');
        const queriesExecuted = queryLog.length;
        const patterns = n1Detector.detect(queryLog);
        const memoryDelta = memoryProfiler.delta();

        return {
          duration,
          queriesExecuted,
          n1Patterns: patterns,
          memoryDelta,
          timestamp: new Date(),
        };
      },
      generateReport(profile: ProfileReport): string {
        const n1Section = formatN1Section(profile.n1Patterns);

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
      },
    };
  },
});

/**
 * Format N+1 section for report
 */
function formatN1Section(patterns: N1Pattern[]): string[] {
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

/**
 * Re-export MemoryProfiler's static formatBytes for convenience
 */
export { MemoryProfiler } from '@profiling/MemoryProfiler';

export default RequestProfiler;
