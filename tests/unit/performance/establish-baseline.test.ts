import * as path from '@node-singletons/path';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

const benchmarkRunAll = vi.fn<() => Promise<void>>();
const benchmarkExportResults = vi.fn<(filePath: string) => void>();

const CodeGenerationBenchmarkCtor = vi.fn(function CodeGenerationBenchmark() {
  return {
    runAll: benchmarkRunAll,
    exportResults: benchmarkExportResults,
  };
});

vi.mock('@performance/CodeGenerationBenchmark', () => ({
  CodeGenerationBenchmark: CodeGenerationBenchmarkCtor,
}));

vi.mock('@config/logger', () => ({
  Logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

describe('performance/establish-baseline', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    benchmarkRunAll.mockReset();
    benchmarkExportResults.mockReset();

    delete (globalThis as unknown as { __ZINTRUST_ESTABLISH_BASELINE_MAIN__?: boolean })
      .__ZINTRUST_ESTABLISH_BASELINE_MAIN__;

    vi.doUnmock('node:url');
  });

  it('runs benchmarks and exports results', async () => {
    benchmarkRunAll.mockResolvedValueOnce(undefined);

    const { establishBaseline } = await import('@performance/establish-baseline' + '?v=api');
    const { Logger } = await import('@config/logger');

    await establishBaseline();

    expect(Logger.info as unknown as Mock).toHaveBeenCalledWith(
      '📊 Establishing Performance Baseline...'
    );
    expect(benchmarkRunAll).toHaveBeenCalledTimes(1);

    expect(benchmarkExportResults).toHaveBeenCalledTimes(1);
    const [filePath] = (benchmarkExportResults as unknown as Mock).mock.calls[0] as [string];
    expect(filePath).toBe(path.join(process.cwd(), 'performance-baseline.json'));

    expect(Logger.info as unknown as Mock).toHaveBeenCalledWith(
      '✅ Baseline established and saved to performance-baseline.json'
    );
    expect(Logger.info as unknown as Mock).toHaveBeenCalledWith(
      '📈 Next: Run optimizations and compare results'
    );
  });

  it('does not auto-run when main flag is not enabled', async () => {
    benchmarkRunAll.mockResolvedValueOnce(undefined);

    await import('@performance/establish-baseline' + '?v=not-main');

    expect(CodeGenerationBenchmarkCtor).not.toHaveBeenCalled();
    expect(benchmarkRunAll).not.toHaveBeenCalled();
    expect(benchmarkExportResults).not.toHaveBeenCalled();
  });

  it('auto-runs and exits(1) when forced main and benchmark fails', async () => {
    benchmarkRunAll.mockRejectedValueOnce(new Error('boom'));

    (
      globalThis as unknown as { __ZINTRUST_ESTABLISH_BASELINE_MAIN__?: boolean }
    ).__ZINTRUST_ESTABLISH_BASELINE_MAIN__ = true;

    const exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation((() => undefined as never) as typeof process.exit);

    const { Logger } = await import('@config/logger');

    await import('@performance/establish-baseline' + '?v=main-fail');

    expect(Logger.error as unknown as Mock).toHaveBeenCalledWith(
      '❌ Baseline failed:',
      expect.any(Error)
    );
    expect(exitSpy).toHaveBeenCalledWith(1);

    exitSpy.mockRestore();
  });

  it('auto-runs successfully when forced main', async () => {
    benchmarkRunAll.mockResolvedValueOnce(undefined);

    (
      globalThis as unknown as { __ZINTRUST_ESTABLISH_BASELINE_MAIN__?: boolean }
    ).__ZINTRUST_ESTABLISH_BASELINE_MAIN__ = true;

    await import('@performance/establish-baseline' + '?v=main-ok');

    expect(CodeGenerationBenchmarkCtor).toHaveBeenCalledTimes(1);
    expect(benchmarkRunAll).toHaveBeenCalledTimes(1);
    expect(benchmarkExportResults).toHaveBeenCalledTimes(1);
  });

  it('falls back to not-main if ESM main detection throws', async () => {
    benchmarkRunAll.mockResolvedValueOnce(undefined);

    vi.doMock('node:url', () => ({
      pathToFileURL: () => {
        throw new Error('nope');
      },
    }));

    delete (globalThis as unknown as { __ZINTRUST_ESTABLISH_BASELINE_MAIN__?: boolean })
      .__ZINTRUST_ESTABLISH_BASELINE_MAIN__;

    await import('@performance/establish-baseline' + '?v=url-throws');

    expect(CodeGenerationBenchmarkCtor).not.toHaveBeenCalled();
    expect(benchmarkRunAll).not.toHaveBeenCalled();
    expect(benchmarkExportResults).not.toHaveBeenCalled();
  });

  it('treats empty argv entry as not-main', async () => {
    const originalArgv = [...process.argv];
    process.argv[1] = '';

    await import('@performance/establish-baseline' + '?v=argv-empty');

    expect(CodeGenerationBenchmarkCtor).not.toHaveBeenCalled();
    expect(benchmarkRunAll).not.toHaveBeenCalled();

    process.argv = originalArgv;
  });
});
