/* eslint-disable max-nested-callbacks */

import { describe, expect, it, vi } from 'vitest';

describe('CodeGenerationBenchmark more coverage', () => {
  it('creates when Benchmark is a factory and MemoryMonitor is a factory', async () => {
    vi.resetModules();

    vi.doMock('@performance/Benchmark', () => ({
      Benchmark: {
        create: (name: string) => ({
          name,
          measureAsync: vi.fn(async () => undefined),
          export: vi.fn(async () => undefined),
          getTable: vi.fn(() => ''),
        }),
      },
      MemoryMonitor: {
        create: () => ({
          start: vi.fn(),
          stop: vi.fn(),
          formatStats: vi.fn(() => ''),
        }),
      },
    }));

    const { CodeGenerationBenchmark } = await import('@performance/CodeGenerationBenchmark');
    expect(() => CodeGenerationBenchmark.create()).not.toThrow();
  });

  it('creates when Benchmark is a constructor and MemoryMonitor is a function', async () => {
    vi.resetModules();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function BenchmarkCtor(name: string): any {
      return {
        name,
        measureAsync: vi.fn(async () => undefined),
        export: vi.fn(async () => undefined),
        getTable: vi.fn(() => ''),
      };
    }

    vi.doMock('@performance/Benchmark', () => ({
      Benchmark: BenchmarkCtor,
      MemoryMonitor: () => ({
        start: vi.fn(),
        stop: vi.fn(),
        formatStats: vi.fn(() => ''),
      }),
    }));

    const { CodeGenerationBenchmark } = await import('@performance/CodeGenerationBenchmark');
    expect(() => CodeGenerationBenchmark.create()).not.toThrow();
  });

  it('throws when Benchmark export is neither factory nor constructor', async () => {
    vi.resetModules();

    vi.doMock('@performance/Benchmark', () => ({
      Benchmark: 123,
      MemoryMonitor: {
        create: () => ({
          start: vi.fn(),
          stop: vi.fn(),
          formatStats: vi.fn(() => ''),
        }),
      },
    }));

    const { CodeGenerationBenchmark } = await import('@performance/CodeGenerationBenchmark');
    expect(() => CodeGenerationBenchmark.create()).toThrow(
      'Benchmark export is neither a factory nor a constructor'
    );
  });

  it('throws when MemoryMonitor export is neither factory nor function', async () => {
    vi.resetModules();

    vi.doMock('@performance/Benchmark', () => ({
      Benchmark: {
        create: (name: string) => ({
          name,
          measureAsync: vi.fn(async () => undefined),
          export: vi.fn(async () => undefined),
          getTable: vi.fn(() => ''),
        }),
      },
      MemoryMonitor: { nope: true },
    }));

    const { CodeGenerationBenchmark } = await import('@performance/CodeGenerationBenchmark');
    expect(() => CodeGenerationBenchmark.create()).toThrow(
      'MemoryMonitor export is neither a factory nor a constructor'
    );
  });

  it('covers realpathSync fallback catch in isMain detection without running benchmarks', async () => {
    vi.resetModules();

    const originalArgv = process.argv;
    process.argv = ['node', '/entry.js'];

    vi.doMock('@common/index', async () => {
      const actual = await vi.importActual<typeof import('@common/index')>('@common/index');
      return {
        ...actual,
        esmFilePath: () => '/current.js',
      };
    });

    vi.doMock('@node-singletons', () => ({
      fs: {
        realpathSync: () => {
          throw new Error('realpath boom');
        },
      },
    }));

    // Import should not throw, and isMain should evaluate false.
    await expect(import('@performance/CodeGenerationBenchmark')).resolves.toBeTruthy();

    process.argv = originalArgv;
  });
});
