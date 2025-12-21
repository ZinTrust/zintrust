import { Benchmark } from '@/performance/Benchmark';
import { describe, expect, it } from 'vitest';

describe('Benchmark', () => {
  it('should measure synchronous operation', () => {
    const benchmark = new Benchmark('Test Suite');
    const result = benchmark.measure(
      'sync',
      () => {
        let sum = 0;
        for (let i = 0; i < 1000; i++) sum += i;
        return sum;
      },
      10
    );

    expect(result.name).toBe('sync');
    expect(result.iterationCount).toBe(10);
    expect(result.duration).toBeGreaterThan(0);
    expect(result.averageTime).toBeGreaterThan(0);
  });

  it('should measure asynchronous operation', async () => {
    const benchmark = new Benchmark('Test Suite');
    const result = await benchmark.measureAsync(
      'async',
      async () => {
        await new Promise((resolve) => setTimeout(resolve, 1));
      },
      5
    );

    expect(result.name).toBe('async');
    expect(result.iterationCount).toBe(5);
    expect(result.duration).toBeGreaterThan(0);
  });

  it('should track memory usage', () => {
    const benchmark = new Benchmark('Test Suite');
    const result = benchmark.measure('memory', () => {
      new Array(1000).fill(0);
    });

    expect(result.memoryBefore).toBeGreaterThan(0);
    expect(result.memoryAfter).toBeGreaterThan(0);
    expect(typeof result.memoryDelta).toBe('number');
  });
});
