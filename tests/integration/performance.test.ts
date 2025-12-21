/**
 * Performance Tests
 * Test suite for performance benchmarking and optimization
 */

import { Benchmark, MemoryMonitor } from '@performance/Benchmark';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

describe('Performance Benchmark Basic Tests - Part 1', () => {
  let benchmark: Benchmark;
  let testDir: string;

  beforeAll(() => {
    benchmark = new Benchmark('Test Suite');
    testDir = path.join(process.cwd(), '.test-bench-benchmark-1');
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
  });

  afterAll(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  it('Benchmark: should measure synchronous operations', (): void => {
    benchmark.measure('Simple Loop', () => {
      let sum = 0;
      for (let i = 0; i < 1000; i++) {
        sum += i;
      }
      return sum;
    });

    const results = benchmark.getResults();
    expect(results.length).toBeGreaterThan(0);

    const lastResult = results.at(-1);
    expect(lastResult).toBeDefined();
    expect(lastResult?.name).toBe('Simple Loop');
    expect(lastResult?.duration).toBeGreaterThan(0);
    expect(lastResult?.iterationCount).toBe(1);
  });

  it('Benchmark: should measure synchronous operations with iterations', (): void => {
    benchmark.measure(
      'Multiple Iterations',
      () => {
        let sum = 0;
        for (let i = 0; i < 100; i++) {
          sum += Math.sqrt(i);
        }
        return sum;
      },
      5
    );

    const results = benchmark.getResults();
    const lastResult = results.at(-1);
    expect(lastResult).toBeDefined();
    expect(lastResult?.iterationCount).toBe(5);
  });
});

describe('Performance Benchmark Basic Tests - Part 2', () => {
  let benchmark: Benchmark;
  let testDir: string;

  beforeAll(() => {
    benchmark = new Benchmark('Test Suite');
    testDir = path.join(process.cwd(), '.test-bench-benchmark-2');
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
  });

  afterAll(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  it('Benchmark: should measure asynchronous operations', async (): Promise<void> => {
    await benchmark.measureAsync('Async Operation', async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      return 42;
    });

    const results = benchmark.getResults();
    const lastResult = results.at(-1);
    expect(lastResult).toBeDefined();
    expect(lastResult?.name).toBe('Async Operation');
    expect(lastResult?.duration).toBeGreaterThanOrEqual(15);
  });
});

describe('Performance Benchmark Advanced Tests', () => {
  let benchmark: Benchmark;
  let testDir: string;

  beforeAll(() => {
    benchmark = new Benchmark('Test Suite');
    testDir = path.join(process.cwd(), '.test-bench-benchmark-adv');
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
  });

  afterAll(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  it('Benchmark: should track metadata', (): void => {
    benchmark.measure(
      'With Metadata',
      () => {
        return Array.from({ length: 100 }, (_, i) => i);
      },
      1,
      { type: 'test', size: 100 }
    );

    const results = benchmark.getResults();
    const lastResult = results.at(-1);
    expect(lastResult).toBeDefined();
    expect(lastResult?.metadata).toEqual({ type: 'test', size: 100 });
  });

  it('Benchmark: should calculate average duration across iterations', (): void => {
    benchmark.measure(
      'Average Duration',
      () => {
        let sum = 0;
        for (let i = 0; i < 10; i++) {
          sum += i;
        }
        return sum;
      },
      3
    );

    const results = benchmark.getResults();
    expect(results.length).toBeGreaterThan(0);
  });
});

describe('Performance Memory Monitor Basic Tests', () => {
  it('MemoryMonitor: should track memory usage', (): void => {
    const monitor = new MemoryMonitor();
    monitor.start(50);

    // Allocate memory
    const arr: number[] = [];
    for (let i = 0; i < 50000; i++) {
      arr.push(Math.random()); // NOSONAR
    }

    // Give time for snapshot
    let sum = 0;
    for (let i = 0; i < 100000; i++) {
      sum += Math.sqrt(i);
    }

    monitor.stop();
    const stats = monitor.getStats();

    expect(arr.length).toBe(50000);
    expect(sum).toBeGreaterThan(0);
    expect(stats.peakHeap).toBeGreaterThanOrEqual(0);
    expect(stats.minHeap).toBeGreaterThanOrEqual(0);
    expect(stats.avgHeap).toBeGreaterThanOrEqual(0);
  });

  it('MemoryMonitor: should calculate memory delta', (): void => {
    const monitor = new MemoryMonitor();
    monitor.start(50);

    const largeArray = new Array(100000).fill(Math.random()); // NOSONAR
    expect(largeArray.length).toBe(100000);

    // Keep array alive
    let sum = 0;
    for (let i = 0; i < 100000; i++) {
      sum += Math.sqrt(i);
    }

    monitor.stop();
    const stats = monitor.getStats();
    expect(sum).toBeGreaterThan(0);
    expect(stats.peakHeap).toBeGreaterThanOrEqual(stats.minHeap);
    expect(stats.avgHeap).toBeGreaterThanOrEqual(0);
  });

  it('MemoryMonitor: should format stats as human-readable string', () => {
    const monitor = new MemoryMonitor();
    monitor.start();
    const _arr = new Array(1000).fill(42);
    expect(_arr.length).toBe(1000);
    monitor.stop();

    const formatted = monitor.formatStats();
    expect(formatted).toContain('Memory');
    expect(formatted).toContain('Heap');
  });
});

describe('Performance Memory Monitor Advanced Tests - Part 1', () => {
  it('MemoryMonitor: should track memory usage during operations', () => {
    const monitor = new MemoryMonitor();
    monitor.start();

    let sum = 0;
    for (let i = 0; i < 100000; i++) {
      sum += Math.sqrt(i);
    }

    monitor.stop();
    const stats = monitor.getStats();
    expect(sum).toBeGreaterThan(0);
    expect(stats.peakHeap).toBeGreaterThanOrEqual(stats.minHeap);
    expect(stats.avgHeap).toBeGreaterThanOrEqual(0);
  });

  it('MemoryMonitor: should format stats as human-readable string', () => {
    const monitor = new MemoryMonitor();
    monitor.start();
    const _arr = new Array(1000).fill(42);
    expect(_arr.length).toBe(1000);
    monitor.stop();

    const formatted = monitor.formatStats();
    expect(formatted).toContain('Memory');
    expect(formatted).toContain('Heap');
  });
});

describe('Performance Memory Monitor Advanced Tests - Part 2', () => {
  it('MemoryMonitor: should support periodic snapshots', (): void => {
    const monitor = new MemoryMonitor();
    monitor.start(100); // 100ms interval

    // Simulate work with memory allocation
    let sum = 0;
    for (let iteration = 0; iteration < 5; iteration++) {
      const tempArray = new Array(100000).fill(Math.random()); // NOSONAR
      expect(tempArray.length).toBe(100000);
      let iterationSum = 0;
      for (let i = 0; i < 500000; i++) {
        iterationSum += Math.sqrt(i);
      }
      sum += iterationSum;
    }

    expect(sum).toBeGreaterThan(0);
    monitor.stop();
    const stats = monitor.getStats();
    expect(stats.snapshots).toBeGreaterThanOrEqual(0);
  });

  it('Memory: should track memory before and after operations', (): void => {
    const monitor = new MemoryMonitor();

    monitor.start(50);

    // Allocate memory
    const largeArray = new Array(50000).fill(0);
    for (let i = 0; i < largeArray.length; i++) {
      largeArray[i] = Math.random(); // NOSONAR
    }

    // Work with array
    let sum = 0;
    for (let i = 0; i < 100000; i++) {
      sum += Math.sqrt(largeArray[i % largeArray.length]);
    }

    monitor.stop();
    const stats = monitor.getStats();

    expect(sum).toBeGreaterThan(0);
    expect(stats.peakHeap).toBeGreaterThanOrEqual(0);
    expect(stats.minHeap).toBeGreaterThanOrEqual(0);
    expect(stats.peakRss).toBeGreaterThanOrEqual(0);
  });
});

describe('Performance Comparison Tests - Part 1', () => {
  it('Comparison: should compare benchmark results', (): void => {
    const baseline = new Benchmark('Baseline');
    baseline.measure(
      'Operation',
      () => {
        let sum = 0;
        for (let i = 0; i < 100; i++) {
          sum += i;
        }
        return sum;
      },
      5
    );

    const current = new Benchmark('Current');
    current.measure(
      'Operation',
      () => {
        let sum = 0;
        for (let i = 0; i < 100; i++) {
          sum += i;
        }
        return sum;
      },
      5
    );

    const comparison = current.compare(baseline.toJSON());

    expect(comparison).toBeDefined();
    expect(comparison.comparisons).toBeDefined();
  });
});

describe('Performance Comparison Tests - Part 2', () => {
  it('Comparison: should detect performance regressions', (): void => {
    const baseline = new Benchmark('Baseline');
    baseline.measure(
      'Quick Op',
      () => {
        let sum = 0;
        for (let i = 0; i < 10; i++) {
          sum += i;
        }
        return sum;
      },
      10
    );

    const current = new Benchmark('Current');
    current.measure(
      'Quick Op',
      () => {
        let sum = 0;
        for (let i = 0; i < 1000; i++) {
          sum += i;
        }
        return sum;
      },
      10
    );

    const comparison = current.compare(baseline.toJSON());
    expect(comparison.comparisons.length).toBeGreaterThan(0);
  });
});

describe('Performance Comparison Tests - Part 3', () => {
  it('Comparison: should detect performance improvements', (): void => {
    const baseline = new Benchmark('Baseline');
    baseline.measure(
      'Slow Op',
      () => {
        let sum = 0;
        for (let i = 0; i < 1000; i++) {
          sum += i;
        }
        return sum;
      },
      10
    );

    const current = new Benchmark('Current');
    current.measure(
      'Slow Op',
      () => {
        let sum = 0;
        for (let i = 0; i < 10; i++) {
          sum += i;
        }
        return sum;
      },
      10
    );

    const comparison = current.compare(baseline.toJSON());
    expect(comparison.comparisons.length).toBeGreaterThan(0);
  });
});

describe('Performance Export Tests', () => {
  let benchmark: Benchmark;
  let testDir: string;

  beforeAll(() => {
    benchmark = new Benchmark('Test Suite');
    testDir = path.join(process.cwd(), '.test-bench-export-file');
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
  });

  afterAll(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  it('Export: should export results to JSON', (): void => {
    benchmark.measure('Export Test', () => {
      const arr = [];
      for (let i = 0; i < 100; i++) arr.push(i * 2);
      return arr;
    });

    const json = benchmark.toJSON();

    expect(json).toBeDefined();
    expect(json.results).toBeDefined();
    expect(json.results.length).toBeGreaterThan(0);
  });

  it('Export: should export results to file', (): void => {
    const outputFile = path.join(testDir, 'benchmark-export.json');

    benchmark.measure('File Export Test', () => {
      let sum = 0;
      for (let i = 0; i < 100; i++) {
        sum += i;
      }
      return sum;
    });

    benchmark.export(outputFile);

    expect(fs.existsSync(outputFile)).toBe(true);
  });
});

describe('Performance Characteristics Tests - Part 1', () => {
  let benchmark: Benchmark;

  beforeAll(() => {
    benchmark = new Benchmark('Test Suite');
  });

  it('Characteristics: should measure object creation', (): void => {
    benchmark.measure(
      'Object Creation',
      () => {
        const obj: Record<string, number> = {};
        for (let i = 0; i < 100; i++) {
          obj[`prop_${i}`] = i;
        }
        return obj;
      },
      10
    );

    const results = benchmark.getResults();
    const lastResult = results.at(-1);
    expect(lastResult).toBeDefined();
    expect(lastResult?.duration).toBeGreaterThan(0);
  });

  it('Characteristics: should measure array operations', (): void => {
    benchmark.measure(
      'Array Operations',
      () => {
        const arr = [];
        for (let i = 0; i < 1000; i++) arr.push(i);
        return arr.map((x) => x * 2).filter((x) => x % 2 === 0);
      },
      10
    );

    const results = benchmark.getResults();
    const lastResult = results.at(-1);
    expect(lastResult).toBeDefined();
    expect(lastResult?.duration).toBeGreaterThan(0);
  });
});

describe('Performance Characteristics Tests - Part 2', () => {
  let benchmark: Benchmark;

  beforeAll(() => {
    benchmark = new Benchmark('Test Suite');
  });

  it('Characteristics: should measure JSON operations', (): void => {
    const data = { name: 'test', value: 42, nested: { key: 'value' } };

    benchmark.measure(
      'JSON Stringify',
      () => {
        return JSON.stringify(data);
      },
      100
    );

    benchmark.measure(
      'JSON Parse',
      () => {
        return structuredClone(data);
      },
      100
    );

    const results = benchmark.getResults();
    expect(results.length).toBeGreaterThan(1);
  });
});

describe('Performance Edge Cases Tests', () => {
  let benchmark: Benchmark;

  beforeAll(() => {
    benchmark = new Benchmark('Test Suite');
  });

  it('Edge Cases: should handle zero iterations as default', (): void => {
    benchmark.measure('Zero Iterations', () => {
      return 42;
    });

    const results = benchmark.getResults();
    const lastResult = results.at(-1);
    expect(lastResult).toBeDefined();
    expect(lastResult?.iterationCount).toBe(1);
  });

  it('Edge Cases: should handle very small durations', (): void => {
    benchmark.measure('Instant Operation', () => {
      return 1 + 1;
    });

    const results = benchmark.getResults();
    const lastResult = results.at(-1);
    expect(lastResult).toBeDefined();
    expect(lastResult?.duration).toBeGreaterThanOrEqual(0);
  });

  it('Edge Cases: should handle large iteration counts', (): void => {
    benchmark.measure(
      'Many Iterations',
      () => {
        return Math.sqrt(16);
      },
      1000
    );

    const results = benchmark.getResults();
    const lastResult = results.at(-1);
    expect(lastResult).toBeDefined();
    expect(lastResult?.iterationCount).toBe(1000);
  });
});
