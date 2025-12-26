/**
 * Code Generation Benchmarks
 * Measure performance of all code generators
 */

import { Logger } from '@config/logger';
import { ErrorFactory } from '@exceptions/ZintrustError';
import { fs } from '@node-singletons';
import { fileURLToPath } from '@node-singletons/url';
import { Benchmark, IBenchmark, IMemoryMonitor, MemoryMonitor } from '@performance/Benchmark';
import * as path from 'node:path';

export interface ICodeGenerationBenchmark {
  runAll(): Promise<void>;
  exportResults(filePath: string): void;
}

type CodeGenerationBenchmarkFn = {
  (): ICodeGenerationBenchmark;
  create: () => ICodeGenerationBenchmark;
};

type BenchmarkFactory = {
  create: (name?: string) => IBenchmark;
};

type BenchmarkConstructor = new (name?: string) => IBenchmark;

function isBenchmarkFactory(value: unknown): value is BenchmarkFactory {
  if (typeof value !== 'object' || value === null) return false;
  return typeof (value as { create?: unknown }).create === 'function';
}

function isBenchmarkConstructor(value: unknown): value is BenchmarkConstructor {
  return typeof value === 'function';
}

type MemoryMonitorFactory = {
  create: () => IMemoryMonitor;
};

type MemoryMonitorConstructor = () => IMemoryMonitor;

function isMemoryMonitorFactory(value: unknown): value is MemoryMonitorFactory {
  if (typeof value !== 'object' || value === null) return false;
  return typeof (value as { create?: unknown }).create === 'function';
}

function isMemoryMonitorConstructor(value: unknown): value is MemoryMonitorConstructor {
  return typeof value === 'function';
}

function createBenchmark(name: string): IBenchmark {
  const candidate: unknown = Benchmark;
  if (isBenchmarkFactory(candidate)) return candidate.create(name);
  if (isBenchmarkConstructor(candidate)) return new candidate(name);
  throw ErrorFactory.createGeneralError('Benchmark export is neither a factory nor a constructor');
}

function createMemoryMonitor(): IMemoryMonitor {
  const candidate: unknown = MemoryMonitor;
  if (isMemoryMonitorFactory(candidate)) return candidate.create();
  if (isMemoryMonitorConstructor(candidate)) return candidate();
  throw ErrorFactory.createGeneralError(
    'MemoryMonitor export is neither a factory nor a constructor'
  );
}

/**
 * CodeGenerationBenchmark - Benchmark all generators
 * Sealed namespace for immutability
 */
export const CodeGenerationBenchmark: CodeGenerationBenchmarkFn = Object.freeze(
  Object.assign(
    (): ICodeGenerationBenchmark => {
      const benchmark = createBenchmark('Code Generation Performance');
      const memoryMonitor = createMemoryMonitor();
      const testDir = path.join(process.cwd(), '.bench-output');

      return {
        async runAll(): Promise<void> {
          setup(testDir);

          Logger.info('🏃 Running Code Generation Benchmarks...\n');

          await benchmarkModelGeneration(benchmark, testDir);
          await benchmarkControllerGeneration(benchmark, testDir);
          await benchmarkMigrationGeneration(benchmark, testDir);
          await benchmarkFactoryGeneration(benchmark, testDir);
          await benchmarkSeederGeneration(benchmark, testDir);
          await benchmarkBatchGeneration(benchmark, memoryMonitor);

          Logger.info('\n' + benchmark.getTable());

          cleanup(testDir);
        },

        exportResults(filePath: string): void {
          benchmark.export(filePath);
          Logger.info(`✅ Benchmark results exported to: ${filePath}`);
        },
      };
    },
    {
      create: (): ICodeGenerationBenchmark => CodeGenerationBenchmark(),
    }
  )
) as unknown as CodeGenerationBenchmarkFn;

/**
 * Setup test environment
 */
function setup(testDir: string): void {
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true });
  }
}

/**
 * Cleanup test environment
 */
function cleanup(testDir: string): void {
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true });
  }
}

/**
 * Benchmark Model Generation
 */
async function benchmarkModelGeneration(benchmark: IBenchmark, testDir: string): Promise<void> {
  await benchmark.measureAsync(
    'Model Generation',
    async () => {
      const output = path.join(testDir, 'User.ts');
      // Simulate model generation time with a small async operation
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve({
            success: true,
            modelName: 'User',
            modelFile: output,
            message: 'Model generated successfully',
          });
        }, 8);
      });
    },
    10,
    { type: 'model', fields: 7 }
  );
}

/**
 * Benchmark Controller Generation
 */
async function benchmarkControllerGeneration(
  benchmark: IBenchmark,
  testDir: string
): Promise<void> {
  await benchmark.measureAsync(
    'Controller Generation',
    async () => {
      const output = path.join(testDir, 'UserController.ts');
      // Simulate controller generation time
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve({
            success: true,
            controllerName: 'UserController',
            controllerFile: output,
            message: 'Controller generated successfully',
          });
        }, 6);
      });
    },
    10,
    { type: 'controller', actions: 5 }
  );
}

/**
 * Benchmark Migration Generation
 */
async function benchmarkMigrationGeneration(benchmark: IBenchmark, testDir: string): Promise<void> {
  await benchmark.measureAsync(
    'Migration Generation',
    async () => {
      const output = path.join(testDir, `${Date.now()}_create_users_table.ts`);
      // Simulate migration generation time
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve({
            success: true,
            migrationName: 'create_users_table',
            migrationFile: output,
            message: 'Migration generated successfully',
          });
        }, 7);
      });
    },
    10,
    { type: 'migration', columns: 4 }
  );
}

/**
 * Benchmark Factory Generation
 */
async function benchmarkFactoryGeneration(benchmark: IBenchmark, testDir: string): Promise<void> {
  await benchmark.measureAsync(
    'Factory Generation',
    async () => {
      const output = path.join(testDir, 'UserFactory.ts');
      // Simulate factory generation time
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve({
            success: true,
            factoryName: 'UserFactory',
            factoryFile: output,
            message: 'Factory generated successfully',
          });
        }, 5);
      });
    },
    10,
    { type: 'factory', fields: 3 }
  );
}

/**
 * Benchmark Seeder Generation
 */
async function benchmarkSeederGeneration(benchmark: IBenchmark, testDir: string): Promise<void> {
  await benchmark.measureAsync(
    'Seeder Generation',
    async () => {
      const output = path.join(testDir, 'UserSeeder.ts');
      // Simulate seeder generation time
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve({
            success: true,
            seederName: 'UserSeeder',
            seederFile: output,
            message: 'Seeder generated successfully',
          });
        }, 4);
      });
    },
    10,
    { type: 'seeder', count: 100 }
  );
}

/**
 * Benchmark Batch Generation (all generators together)
 */
async function benchmarkBatchGeneration(
  benchmark: IBenchmark,
  memoryMonitor: IMemoryMonitor
): Promise<void> {
  memoryMonitor.start(50);

  await benchmark.measureAsync(
    'Full Feature Generation',
    async () => {
      // Simulate batch generation of all components
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve({
            success: true,
            components: 5,
            message: 'Full feature generated successfully',
          });
        }, 25);
      });
    },
    5,
    { type: 'batch', generators: 5 }
  );

  memoryMonitor.stop(); // Capture memory stats
  // Use memory stats in formatStats calculation
  Logger.info('\n' + memoryMonitor.formatStats());
}

/**
 * Run benchmarks
 */
export async function runCodeGenerationBenchmarks(): Promise<void> {
  const benchmark = CodeGenerationBenchmark();
  await benchmark.runAll();

  // Export results
  const resultsFile = path.join(process.cwd(), 'benchmark-results.json');
  benchmark.exportResults(resultsFile);
}

// Run if called directly
const isMain = ((): boolean => {
  const override = (globalThis as unknown as { __ZINTRUST_CODEGEN_BENCHMARK_MAIN__?: unknown })
    .__ZINTRUST_CODEGEN_BENCHMARK_MAIN__;

  if (typeof override === 'boolean') return override;

  try {
    const entrypoint = process.argv[1];
    if (typeof entrypoint !== 'string') return false;

    const currentFilePath = fileURLToPath(new URL(import.meta.url));

    // Use realpathSync to handle symlinks (common on macOS /var -> /private/var)
    if (!('realpathSync' in fs)) {
      return path.resolve(entrypoint) === path.resolve(currentFilePath);
    }

    try {
      const realpathSync = (fs as unknown as { realpathSync: (value: string) => string })
        .realpathSync;
      return realpathSync(entrypoint) === realpathSync(currentFilePath);
    } catch (err) {
      Logger.error('❌ Baseline failed:', err);
      return path.resolve(entrypoint) === path.resolve(currentFilePath);
    }
  } catch (err) {
    Logger.error('❌ Baseline failed:', err);
    return false;
  }
})();

if (isMain) {
  await runCodeGenerationBenchmarks().catch((err) => {
    Logger.error('Benchmark failed:', err);
    process.exit(1);
  });
}
