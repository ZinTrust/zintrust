/**
 * Memory Profiler
 * Tracks heap memory usage and garbage collection events
 */

import { MemoryDelta, MemorySnapshot } from '@profiling/types';

export interface IMemoryProfiler {
  start(): void;
  end(): MemorySnapshot;
  delta(): MemoryDelta;
  getStartSnapshot(): MemorySnapshot | null;
  getEndSnapshot(): MemorySnapshot | null;
  getReport(): string;
}

/**
 * MemoryProfiler captures memory usage before and after request execution
 * Sealed namespace for immutability
 */
export const MemoryProfiler = Object.freeze({
  /**
   * Create a new memory profiler instance
   */
  create(): IMemoryProfiler {
    let startSnapshot: MemorySnapshot | null = null;
    let endSnapshot: MemorySnapshot | null = null;

    const captureSnapshot = (): MemorySnapshot => {
      const mem = process.memoryUsage();
      return {
        heapUsed: mem.heapUsed,
        heapTotal: mem.heapTotal,
        external: mem.external,
        rss: mem.rss,
        timestamp: new Date(),
      };
    };

    const delta = (): MemoryDelta => {
      if (!startSnapshot || !endSnapshot) {
        return { heapUsed: 0, heapTotal: 0, external: 0, rss: 0 };
      }

      return {
        heapUsed: endSnapshot.heapUsed - startSnapshot.heapUsed,
        heapTotal: endSnapshot.heapTotal - startSnapshot.heapTotal,
        external: endSnapshot.external - startSnapshot.external,
        rss: endSnapshot.rss - startSnapshot.rss,
      };
    };

    const profiler: IMemoryProfiler = {
      start() {
        if (globalThis.gc) globalThis.gc();
        startSnapshot = captureSnapshot();
        endSnapshot = null;
      },
      end() {
        endSnapshot = captureSnapshot();
        return endSnapshot;
      },
      delta,
      getStartSnapshot() {
        return startSnapshot;
      },
      getEndSnapshot() {
        return endSnapshot;
      },
      getReport() {
        if (!startSnapshot || !endSnapshot) {
          return 'Memory profiling not started or completed';
        }

        const d = delta();
        const lines: string[] = ['Memory Profile Report:'];

        lines.push(
          `  Heap Used: ${formatBytes(d.heapUsed)}`,
          `  Heap Total: ${formatBytes(d.heapTotal)}`,
          `  External: ${formatBytes(d.external)}`,
          `  RSS: ${formatBytes(d.rss)}`
        );

        return lines.join('\n');
      },
    };

    return profiler;
  },

  /**
   * Format memory value as human-readable string
   */
  formatBytes(bytes: number): string {
    return formatBytes(bytes);
  },
});

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
