/**
 * Memory Profiler
 * Tracks heap memory usage and garbage collection events
 */

import { MemoryDelta, MemorySnapshot } from '@profiling/types';

/**
 * MemoryProfiler captures memory usage before and after request execution
 * Provides delta calculation for memory consumption analysis
 */
export class MemoryProfiler {
  private startSnapshot: MemorySnapshot | null = null;
  private endSnapshot: MemorySnapshot | null = null;

  /**
   * Capture current memory state
   */
  private captureSnapshot(): MemorySnapshot {
    const mem = process.memoryUsage();
    return {
      heapUsed: mem.heapUsed,
      heapTotal: mem.heapTotal,
      external: mem.external,
      rss: mem.rss,
      timestamp: new Date(),
    };
  }

  /**
   * Start memory profiling
   * Should be called before request execution
   */
  public start(): void {
    // Force garbage collection if available
    if (globalThis.gc) {
      globalThis.gc();
    }

    this.startSnapshot = this.captureSnapshot();
    this.endSnapshot = null;
  }

  /**
   * End memory profiling
   * Should be called after request execution
   */
  public end(): MemorySnapshot {
    this.endSnapshot = this.captureSnapshot();
    return this.endSnapshot;
  }

  /**
   * Get memory delta between start and end
   */
  public delta(): MemoryDelta {
    if (!this.startSnapshot || !this.endSnapshot) {
      return {
        heapUsed: 0,
        heapTotal: 0,
        external: 0,
        rss: 0,
      };
    }

    return {
      heapUsed: this.endSnapshot.heapUsed - this.startSnapshot.heapUsed,
      heapTotal: this.endSnapshot.heapTotal - this.startSnapshot.heapTotal,
      external: this.endSnapshot.external - this.startSnapshot.external,
      rss: this.endSnapshot.rss - this.startSnapshot.rss,
    };
  }

  /**
   * Get start snapshot
   */
  public getStartSnapshot(): MemorySnapshot | null {
    return this.startSnapshot;
  }

  /**
   * Get end snapshot
   */
  public getEndSnapshot(): MemorySnapshot | null {
    return this.endSnapshot;
  }

  /**
   * Format memory value as human-readable string
   */
  public static formatBytes(bytes: number): string {
    return formatBytes(bytes);
  }

  /**
   * Get human-readable memory report
   */
  public getReport(): string {
    if (!this.startSnapshot || !this.endSnapshot) {
      return 'Memory profiling not started or completed';
    }

    const d = this.delta();
    const lines: string[] = ['Memory Profile Report:'];

    lines.push(
      `  Heap Used: ${MemoryProfiler.formatBytes(d.heapUsed)}`,
      `  Heap Total: ${MemoryProfiler.formatBytes(d.heapTotal)}`,
      `  External: ${MemoryProfiler.formatBytes(d.external)}`,
      `  RSS: ${MemoryProfiler.formatBytes(d.rss)}`
    );

    return lines.join('\n');
  }
}

/**
 * Format memory value as human-readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(k));

  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}
