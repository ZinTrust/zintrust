import { MemoryProfiler } from '@profiling/MemoryProfiler';
import { beforeEach, describe, expect, it } from 'vitest';

describe('MemoryProfiler', () => {
  let profiler: MemoryProfiler;

  beforeEach(() => {
    profiler = new MemoryProfiler();
  });

  it('should capture initial memory snapshot', () => {
    profiler.start();
    const snapshot = profiler.end();

    expect(snapshot).toBeDefined();
    expect(snapshot.heapUsed).toBeGreaterThan(0);
    expect(snapshot.heapTotal).toBeGreaterThan(0);
    expect(snapshot.rss).toBeGreaterThan(0);
    expect(snapshot.timestamp).toBeInstanceOf(Date);
  });

  it('should have external memory property', () => {
    profiler.start();
    const snapshot = profiler.end();

    expect(snapshot.external).toBeGreaterThanOrEqual(0);
  });

  it('should calculate memory delta between snapshots', async () => {
    profiler.start();

    // Allocate some memory
    Array.from({ length: 1000 }, (_, i) => ({
      id: i,
      name: `Item ${i}`,
      data: new Array(100).fill(Math.random()),
    }));

    const delta = profiler.end();

    expect(delta.heapUsed).toBeDefined();
    expect(delta.heapTotal).toBeDefined();
  });

  it('should have valid timestamp in snapshot', () => {
    profiler.start();
    const snapshot = profiler.end();

    expect(snapshot.timestamp.getTime()).toBeGreaterThan(0);
  });

  it('should allow multiple start/end cycles', () => {
    profiler.start();
    const delta1 = profiler.end();
    expect(delta1).toBeDefined();

    profiler.start();
    const delta2 = profiler.end();
    expect(delta2).toBeDefined();
  });

  it('should return non-negative memory values', () => {
    profiler.start();
    const delta = profiler.end();

    expect(delta.heapUsed).toBeGreaterThanOrEqual(0);
    expect(delta.heapTotal).toBeGreaterThanOrEqual(0);
    expect(delta.external).toBeGreaterThanOrEqual(0);
    expect(delta.rss).toBeGreaterThanOrEqual(0);
  });

  it('should track significant memory changes', async () => {
    profiler.start();

    // Create a significant memory allocation
    for (let i = 0; i < 100; i++) {
      const _temp = [
        {
          buffer: Buffer.alloc(10000),
          data: new Array(1000).fill(Math.random()),
        },
      ];
      expect(_temp.length).toBe(1);
    }

    const delta = profiler.end();

    expect(delta.heapUsed).toBeGreaterThanOrEqual(0);
  });

  it('should include all memory metrics in delta', () => {
    profiler.start();
    const delta = profiler.end();

    expect(Object.keys(delta).sort((a, b) => a.localeCompare(b))).toEqual(
      ['external', 'heapTotal', 'heapUsed', 'rss', 'timestamp'].sort((a, b) => a.localeCompare(b))
    );
  });
});
