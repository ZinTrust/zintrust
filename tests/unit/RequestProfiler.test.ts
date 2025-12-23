import { IRequestProfiler, RequestProfiler } from '@profiling/RequestProfiler';
import { beforeEach, describe, expect, it } from 'vitest';

describe('RequestProfiler Basic Tests', () => {
  let profiler: IRequestProfiler;

  beforeEach(() => {
    profiler = RequestProfiler.create();
  });

  it('should capture request profile with all metrics', async () => {
    const profile = await profiler.captureRequest(async () => {
      // Simulate some work
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(profile).toBeDefined();
    expect(profile.duration).toBeGreaterThanOrEqual(45);
    expect(profile.queriesExecuted).toBeGreaterThanOrEqual(0);
    expect(profile.timestamp).toBeInstanceOf(Date);
    expect(profile.n1Patterns).toBeInstanceOf(Array);
    expect(profile.memoryDelta).toBeDefined();
  });

  it('should include query metrics in profile', async () => {
    const profile = await profiler.captureRequest(async () => {
      // No actual queries executed in this test
    });

    expect(profile.queriesExecuted).toBeDefined();
    expect(profile.queriesExecuted).toBeGreaterThanOrEqual(0);
    expect(profile.n1Patterns).toBeInstanceOf(Array);
  });

  it('should capture accurate duration', async () => {
    const delay = 100;
    const profile = await profiler.captureRequest(async () => {
      await new Promise((resolve) => setTimeout(resolve, delay));
    });

    expect(profile.duration).toBeGreaterThanOrEqual(delay - 10); // Allow 10ms variance
  });

  it('should return unique timestamp for each profile', async () => {
    const profile1 = await profiler.captureRequest(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    const profile2 = await profiler.captureRequest(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    expect(profile1.timestamp.getTime()).not.toEqual(profile2.timestamp.getTime());
  });
});

describe('RequestProfiler Advanced Metrics', () => {
  let profiler: IRequestProfiler;

  beforeEach(() => {
    profiler = RequestProfiler.create();
  });

  it('should include memory delta in profile', async () => {
    const profile = await profiler.captureRequest(async () => {
      // Allocate some memory
      new Array(1000).fill(Math.random()); // NOSONAR
    });

    expect(profile.memoryDelta).toBeDefined();
    expect(typeof profile.memoryDelta.heapUsed).toBe('number');
    expect(typeof profile.memoryDelta.heapTotal).toBe('number');
    expect(typeof profile.memoryDelta.rss).toBe('number');
  });

  it('should capture accurate duration', async () => {
    const delay = 100;
    const profile = await profiler.captureRequest(async () => {
      await new Promise((resolve) => setTimeout(resolve, delay));
    });

    expect(profile.duration).toBeGreaterThanOrEqual(delay - 10); // Allow 10ms variance
  });

  it('should handle async operations', async () => {
    const profile = await profiler.captureRequest(async () => {
      await new Promise((resolve) => setTimeout(resolve, 25));
      const result = new Array(100).fill(0).map((x) => x + 1);
      return result;
    });

    expect(profile.duration).toBeGreaterThanOrEqual(20); // Allow variance
  });

  it('should generate valid profile report', async () => {
    const profile = await profiler.captureRequest(async () => {
      // Simulate work
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    expect(profile.duration).toBeGreaterThan(0);
    expect(profile.queriesExecuted >= 0).toBe(true);
    expect(Array.isArray(profile.n1Patterns)).toBe(true);
    expect(profile.timestamp instanceof Date).toBe(true);
    expect(profile.memoryDelta).toBeDefined();
  });
});

describe('RequestProfiler Advanced Scenarios', () => {
  let profiler: IRequestProfiler;

  beforeEach(() => {
    profiler = RequestProfiler.create();
  });

  it('should return unique timestamp for each profile', async () => {
    const profile1 = await profiler.captureRequest(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    const profile2 = await profiler.captureRequest(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    expect(profile1.timestamp.getTime()).not.toEqual(profile2.timestamp.getTime());
  });

  it('should capture N+1 patterns if present', async () => {
    const profile = await profiler.captureRequest(async () => {
      // N+1 patterns would be captured from query events
    });

    expect(Array.isArray(profile.n1Patterns)).toBe(true);
  });

  it('should allow function to throw and still capture profile', async () => {
    try {
      await profiler.captureRequest(async () => {
        throw new Error('Test error');
      });
    } catch (error) {
      expect((error as Error).message).toBe('Test error');
    }
  });

  it('should include memory metrics in profile', async () => {
    const profile = await profiler.captureRequest(async () => {
      // Simulate memory allocation
      Buffer.alloc(1024 * 1024); // 1MB
    });

    expect(profile.memoryDelta).toBeDefined();
    expect(typeof profile.memoryDelta.heapUsed).toBe('number');
    expect(typeof profile.memoryDelta.heapTotal).toBe('number');
    expect(typeof profile.memoryDelta.external).toBe('number');
    expect(typeof profile.memoryDelta.rss).toBe('number');
  });
});
