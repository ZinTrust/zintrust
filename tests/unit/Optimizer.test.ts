import { LazyLoader, Memoize, ParallelGenerator } from '@performance/Optimizer';
import { beforeEach, describe, expect, it } from 'vitest';

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

describe('Optimizer LazyLoader Tests', (): void => {
  let loader: LazyLoader;

  beforeEach((): void => {
    loader = new LazyLoader();
  });

  it('should load module only when requested', async (): Promise<void> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const module = await loader.load<any>('node:fs');
    expect(module).toBeDefined();
    expect(module.readFileSync).toBeDefined();
  });

  it('should cache loaded modules', async (): Promise<void> => {
    const module1 = await loader.load('node:os');
    const module2 = await loader.load('node:os');
    expect(module1).toBe(module2);
  });

  it('should clear cache', async (): Promise<void> => {
    await loader.load('node:path');
    loader.clear();

    const module = await loader.load('node:path');
    expect(module).toBeDefined();
  });
});

describe('Optimizer Parallel Execution', (): void => {
  it('ParallelGenerator: should run generators in parallel', async (): Promise<void> => {
    const generators = [
      async (): Promise<string> => {
        await sleep(10);
        return 'a';
      },
      async (): Promise<string> => {
        await sleep(10);
        return 'b';
      },
      async (): Promise<string> => {
        await sleep(10);
        return 'c';
      },
    ];

    const start = Date.now();
    const results = await ParallelGenerator.runAll(generators);
    const duration = Date.now() - start;

    expect(results).toEqual(['a', 'b', 'c']);
    expect(duration).toBeLessThan(50);
  });

  it('ParallelGenerator: should handle errors in generators', async (): Promise<void> => {
    const generators = [
      async (): Promise<string> => 'a',
      async (): Promise<never> => {
        throw new Error('Fail');
      },
    ];

    await expect(ParallelGenerator.runAll(generators)).rejects.toThrow('Fail');
  });
});

describe('Optimizer Concurrency and Chunks', (): void => {
  it('ParallelGenerator: should respect concurrency limit', async (): Promise<void> => {
    let active = 0;
    let maxActive = 0;
    const executionTime = 20;

    const generators = Array.from({ length: 5 }, (_, i) => async (): Promise<number> => {
      active++;
      maxActive = Math.max(maxActive, active);
      await sleep(executionTime);
      active--;
      return i;
    });

    await ParallelGenerator.runBatch(generators, 2);
    expect(maxActive).toBeLessThanOrEqual(2);
  });

  it('ParallelGenerator: should process in chunks', async (): Promise<void> => {
    const delay = async (val: string): Promise<string> => {
      await sleep(20);
      return val;
    };

    const generators = [
      (): Promise<string> => delay('a'),
      (): Promise<string> => delay('b'),
      (): Promise<string> => delay('c'),
    ];

    const results = await ParallelGenerator.runBatch(generators, 1);
    expect(results).toEqual(['a', 'b', 'c']);
  });
});

describe('Optimizer Memoize Tests', (): void => {
  it('should cache function results', (): void => {
    let calls = 0;
    const fn = (x: number): number => {
      calls++;
      return x * 2;
    };

    const memoized = Memoize.create(fn);

    expect(memoized(5)).toBe(10);
    expect(memoized(5)).toBe(10);
    expect(calls).toBe(1);
  });

  it('should handle multiple arguments', (): void => {
    let calls = 0;
    const fn = (a: number, b: number): number => {
      calls++;
      return a + b;
    };

    const memoized = Memoize.create(fn);

    expect(memoized(2, 3)).toBe(5);
    expect(memoized(2, 3)).toBe(5);
    expect(memoized(3, 2)).toBe(5);
    expect(calls).toBe(2);
  });

  it('should respect TTL', async (): Promise<void> => {
    let calls = 0;
    const fn = (): string => {
      calls++;
      return 'data';
    };

    const memoized = Memoize.create(fn, { ttl: 50 });

    expect(memoized()).toBe('data');
    expect(memoized()).toBe('data');
    expect(calls).toBe(1);

    await sleep(60);

    expect(memoized()).toBe('data');
    expect(calls).toBe(2);
  });

  it('should use custom key generator', (): void => {
    const fn = (obj: { id: number }): number => obj.id;
    const memoized = Memoize.create(fn, {
      keyGenerator: (args: [{ id: number }]): string => String(args[0].id),
    });

    expect(memoized({ id: 1 })).toBe(1);
    expect(memoized({ id: 1 })).toBe(1);
  });
});
