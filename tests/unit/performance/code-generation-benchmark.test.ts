import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const loggerInfo = vi.fn();
const loggerWarn = vi.fn();
const loggerError = vi.fn();

vi.mock('@config/logger', () => ({
  Logger: {
    info: loggerInfo,
    warn: loggerWarn,
    error: loggerError,
  },
}));

const existsSync = vi.fn();
const mkdirSync = vi.fn();
const rmSync = vi.fn();

vi.mock('node:fs', () => ({
  existsSync,
  mkdirSync,
  rmSync,
}));

type MeasureAsync = (
  label: string,
  fn: () => Promise<unknown>,
  iterations: number,
  meta: Record<string, unknown>
) => Promise<void>;

const measureAsync = vi.fn<MeasureAsync>(async (_label, fn) => {
  await fn();
});

const getTable = vi.fn(() => 'table');
const exportFn = vi.fn();

const memoryStart = vi.fn();
const memoryStop = vi.fn();
const memoryFormatStats = vi.fn(() => 'stats');

const BenchmarkCtor = vi.fn(function Benchmark(this: any) {
  return {
    measureAsync,
    getTable,
    export: exportFn,
  };
});

const MemoryMonitorCtor = vi.fn(function MemoryMonitor(this: any) {
  return {
    start: memoryStart,
    stop: memoryStop,
    formatStats: memoryFormatStats,
  };
});

vi.mock('@performance/Benchmark', () => ({
  Benchmark: BenchmarkCtor,
  MemoryMonitor: MemoryMonitorCtor,
}));

describe('CodeGenerationBenchmark', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    // Ensure per-test isolation: mockImplementationOnce() in one test must not
    // leak into later tests.
    BenchmarkCtor.mockReset();
    BenchmarkCtor.mockImplementation(function Benchmark(this: any) {
      return {
        measureAsync,
        getTable,
        export: exportFn,
      };
    });

    MemoryMonitorCtor.mockReset();
    MemoryMonitorCtor.mockImplementation(function MemoryMonitor(this: any) {
      return {
        start: memoryStart,
        stop: memoryStop,
        formatStats: memoryFormatStats,
      };
    });

    (globalThis as any).__ZINTRUST_CODEGEN_BENCHMARK_MAIN__ = false;
  });

  it('runAll: creates output dir, runs all benchmarks, prints table, then cleans up', async () => {
    existsSync.mockReturnValueOnce(false).mockReturnValueOnce(true);

    const { CodeGenerationBenchmark } = await import(
      '@performance/CodeGenerationBenchmark' + '?v=runAll'
    );

    vi.useFakeTimers();

    const bench = new CodeGenerationBenchmark();
    const runPromise = bench.runAll();

    await vi.runAllTimersAsync();
    await runPromise;

    expect(mkdirSync).toHaveBeenCalledWith(expect.stringContaining('.bench-output'), {
      recursive: true,
    });
    expect(measureAsync).toHaveBeenCalledTimes(6);
    expect(getTable).toHaveBeenCalledTimes(1);
    expect(rmSync).toHaveBeenCalledWith(expect.stringContaining('.bench-output'), {
      recursive: true,
    });

    expect(memoryStart).toHaveBeenCalledWith(50);
    expect(memoryStop).toHaveBeenCalledTimes(1);
    expect(memoryFormatStats).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  it('runAll: skips mkdir when dir exists and skips rm when missing', async () => {
    existsSync.mockReturnValueOnce(true).mockReturnValueOnce(false);

    const { CodeGenerationBenchmark } = await import(
      '@performance/CodeGenerationBenchmark' + '?v=runAll2'
    );

    vi.useFakeTimers();

    const bench = new CodeGenerationBenchmark();
    const runPromise = bench.runAll();

    await vi.runAllTimersAsync();
    await runPromise;

    expect(mkdirSync).not.toHaveBeenCalled();
    expect(rmSync).not.toHaveBeenCalled();

    vi.useRealTimers();
  });

  it('exportResults: delegates to benchmark.export and logs', async () => {
    const { CodeGenerationBenchmark } = await import(
      '@performance/CodeGenerationBenchmark' + '?v=export'
    );

    const bench = CodeGenerationBenchmark();
    const testPath = 'benchmark-results.json';
    bench.exportResults(testPath);

    expect(exportFn).toHaveBeenCalledWith(testPath);
    expect(loggerInfo).toHaveBeenCalledWith(`✅ Benchmark results exported to: ${testPath}`);
  });

  it('runCodeGenerationBenchmarks: runs and exports to default file', async () => {
    existsSync.mockReturnValueOnce(true).mockReturnValueOnce(false);

    const { runCodeGenerationBenchmarks } = await import(
      '@performance/CodeGenerationBenchmark' + '?v=runFn'
    );

    vi.useFakeTimers();
    const runPromise = runCodeGenerationBenchmarks();
    await vi.runAllTimersAsync();
    await runPromise;
    vi.useRealTimers();

    expect(exportFn).toHaveBeenCalledWith(expect.stringContaining('benchmark-results.json'));
    expect(loggerInfo).toHaveBeenCalledWith(
      expect.stringContaining('✅ Benchmark results exported to:')
    );
  });

  it('main detection: falls back safely when override is not boolean', async () => {
    vi.resetModules();
    vi.clearAllMocks();
    (globalThis as any).__ZINTRUST_CODEGEN_BENCHMARK_MAIN__ = 'nope';

    await import('@performance/CodeGenerationBenchmark' + '?v=main-detect');

    expect(loggerError).not.toHaveBeenCalled();
  });

  it('main detection: returns false when argv[1] is not a string', async () => {
    vi.resetModules();
    vi.clearAllMocks();

    const originalArgv = process.argv;
    process.argv = [...originalArgv];
    process.argv[1] = undefined as unknown as string;

    (globalThis as any).__ZINTRUST_CODEGEN_BENCHMARK_MAIN__ = 'nope';

    await import('@performance/CodeGenerationBenchmark' + '?v=main-argv');

    expect(loggerError).not.toHaveBeenCalled();

    process.argv = originalArgv;
  });

  it('main detection: catches exceptions and returns false', async () => {
    vi.resetModules();
    vi.clearAllMocks();

    (globalThis as any).__ZINTRUST_CODEGEN_BENCHMARK_MAIN__ = 'nope';

    vi.doMock('node:url', () => ({
      fileURLToPath: () => {
        throw new Error('boom');
      },
    }));

    try {
      await import('@performance/CodeGenerationBenchmark' + '?v=main-catch');
    } finally {
      vi.doUnmock('node:url');
    }

    expect(loggerError).toHaveBeenCalledWith('❌ Baseline failed:', expect.any(Error));
  });

  it('esm main detection: logs and exits on failure when argv matches module path', async () => {
    vi.resetModules();
    vi.clearAllMocks();

    // Create fresh mock instances for this test
    const testLoggerError = vi.fn();
    const testLoggerInfo = vi.fn();

    vi.doMock('@config/logger', () => ({
      Logger: {
        info: testLoggerInfo,
        error: testLoggerError,
      },
    }));

    vi.doMock('@performance/Benchmark', () => ({
      Benchmark: BenchmarkCtor,
      MemoryMonitor: MemoryMonitorCtor,
    }));

    vi.doMock('node:fs', () => ({
      existsSync,
      mkdirSync,
      rmSync,
    }));

    const originalArgv = process.argv;
    process.argv = [...originalArgv];
    process.argv[1] = path.resolve(process.cwd(), 'src/performance/CodeGenerationBenchmark.ts');

    // Don't override - let it detect from argv[1]
    (globalThis as any).__ZINTRUST_CODEGEN_BENCHMARK_MAIN__ = undefined;

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as any);

    BenchmarkCtor.mockImplementationOnce(function Benchmark() {
      throw new Error('boom');
    });

    await import('@performance/CodeGenerationBenchmark' + '?v=esm-main-fail');

    expect(testLoggerError).toHaveBeenCalledWith('Benchmark failed:', expect.any(Error));
    expect(exitSpy).toHaveBeenCalledWith(1);

    exitSpy.mockRestore();
    process.argv = originalArgv;

    vi.doUnmock('@config/logger');
    vi.doUnmock('@performance/Benchmark');
    vi.doUnmock('node:fs');
  });

  it('main-module path: runs successfully when forced main', async () => {
    vi.resetModules();
    vi.clearAllMocks();

    // Re-setup all mocks after resetModules
    loggerInfo.mockClear();
    loggerError.mockClear();

    vi.doMock('@config/logger', () => ({
      Logger: {
        info: loggerInfo,
        error: loggerError,
      },
    }));

    vi.doMock('@performance/Benchmark', () => ({
      Benchmark: BenchmarkCtor,
      MemoryMonitor: MemoryMonitorCtor,
    }));

    vi.doMock('node:fs', () => ({
      existsSync,
      mkdirSync,
      rmSync,
    }));

    // Ensure runAll() uses timers but completes deterministically.
    existsSync.mockReturnValueOnce(false).mockReturnValueOnce(true);

    (globalThis as any).__ZINTRUST_CODEGEN_BENCHMARK_MAIN__ = true;

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as any);

    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout').mockImplementation(((
      callback: (...args: unknown[]) => void,
      _ms?: number,
      ...args: unknown[]
    ) => {
      callback(...args);
      return 0 as unknown as ReturnType<typeof setTimeout>;
    }) as unknown as typeof setTimeout);

    await import('@performance/CodeGenerationBenchmark' + '?v=main-success');

    expect(loggerError).not.toHaveBeenCalled();
    expect(exitSpy).not.toHaveBeenCalled();
    expect(exportFn).toHaveBeenCalledWith(expect.stringContaining('benchmark-results.json'));
    expect(loggerInfo).toHaveBeenCalledWith(
      expect.stringContaining('✅ Benchmark results exported to:')
    );

    exitSpy.mockRestore();
    setTimeoutSpy.mockRestore();

    vi.doUnmock('@config/logger');
    vi.doUnmock('@performance/Benchmark');
    vi.doUnmock('node:fs');
  });

  it('main-module path: logs and exits on failure', async () => {
    vi.resetModules();
    vi.clearAllMocks();

    // Re-setup all mocks after resetModules
    loggerInfo.mockClear();
    loggerError.mockClear();

    vi.doMock('@config/logger', () => ({
      Logger: {
        info: loggerInfo,
        error: loggerError,
      },
    }));

    vi.doMock('@performance/Benchmark', () => ({
      Benchmark: BenchmarkCtor,
      MemoryMonitor: MemoryMonitorCtor,
    }));

    vi.doMock('node:fs', () => ({
      existsSync,
      mkdirSync,
      rmSync,
    }));

    (globalThis as any).__ZINTRUST_CODEGEN_BENCHMARK_MAIN__ = true;

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as any);

    BenchmarkCtor.mockImplementationOnce(function Benchmark() {
      throw new Error('boom');
    });

    await import('@performance/CodeGenerationBenchmark' + '?v=main-fail');

    expect(loggerError).toHaveBeenCalledWith('Benchmark failed:', expect.any(Error));
    expect(exitSpy).toHaveBeenCalledWith(1);

    exitSpy.mockRestore();

    vi.doUnmock('@config/logger');
    vi.doUnmock('@performance/Benchmark');
    vi.doUnmock('node:fs');
  });
});
