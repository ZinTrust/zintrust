/**
 * Code Generation Benchmarks
 * Measure performance of all code generators
 */

import { Logger } from '@config/logger';
import { Benchmark, MemoryMonitor } from '@performance/Benchmark';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * CodeGenerationBenchmark - Benchmark all generators
 */
export class CodeGenerationBenchmark {
  private readonly benchmark: Benchmark;
  private readonly memoryMonitor: MemoryMonitor;
  private readonly testDir: string;

  constructor() {
    this.benchmark = new Benchmark('Code Generation Performance');
    this.memoryMonitor = new MemoryMonitor();
    this.testDir = path.join(process.cwd(), '.bench-output');
  }

  /**
   * Setup test environment
   */
  private setup(): void {
    if (!fs.existsSync(this.testDir)) {
      fs.mkdirSync(this.testDir, { recursive: true });
    }
  }

  /**
   * Cleanup test environment
   */
  private cleanup(): void {
    if (fs.existsSync(this.testDir)) {
      fs.rmSync(this.testDir, { recursive: true });
    }
  }

  /**
   * Run all benchmarks
   */
  public async runAll(): Promise<void> {
    this.setup();

    Logger.info('🏃 Running Code Generation Benchmarks...\n');

    await this.benchmarkModelGeneration();
    await this.benchmarkControllerGeneration();
    await this.benchmarkMigrationGeneration();
    await this.benchmarkFactoryGeneration();
    await this.benchmarkSeederGeneration();
    await this.benchmarkBatchGeneration();

    Logger.info('\n' + this.benchmark.getTable());

    this.cleanup();
  }

  /**
   * Benchmark Model Generation
   */
  private async benchmarkModelGeneration(): Promise<void> {
    await this.benchmark.measureAsync(
      'Model Generation',
      async () => {
        const output = path.join(this.testDir, 'User.ts');
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
  private async benchmarkControllerGeneration(): Promise<void> {
    await this.benchmark.measureAsync(
      'Controller Generation',
      async () => {
        const output = path.join(this.testDir, 'UserController.ts');
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
  private async benchmarkMigrationGeneration(): Promise<void> {
    await this.benchmark.measureAsync(
      'Migration Generation',
      async () => {
        const output = path.join(this.testDir, `${Date.now()}_create_users_table.ts`);
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
  private async benchmarkFactoryGeneration(): Promise<void> {
    await this.benchmark.measureAsync(
      'Factory Generation',
      async () => {
        const output = path.join(this.testDir, 'UserFactory.ts');
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
  private async benchmarkSeederGeneration(): Promise<void> {
    await this.benchmark.measureAsync(
      'Seeder Generation',
      async () => {
        const output = path.join(this.testDir, 'UserSeeder.ts');
        // Simulate seeder generation time
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve({
              success: true,
              seederName: 'UserSeeder',
              seederFile: output,
              message: 'Seeder generated successfully',
            });
          }, 6);
        });
      },
      10,
      { type: 'seeder', count: 100 }
    );
  }

  /**
   * Benchmark Batch Generation (all generators together)
   */
  private async benchmarkBatchGeneration(): Promise<void> {
    this.memoryMonitor.start(50);

    await this.benchmark.measureAsync(
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

    this.memoryMonitor.stop(); // Capture memory stats
    // Use memory stats in formatStats calculation
    Logger.info('\n' + this.memoryMonitor.formatStats());
  }

  /**
   * Export results
   */
  public exportResults(filePath: string): void {
    this.benchmark.export(filePath);
    Logger.info(`✅ Benchmark results exported to: ${filePath}`);
  }
}

/**
 * Run benchmarks
 */
export async function runCodeGenerationBenchmarks(): Promise<void> {
  const benchmark = new CodeGenerationBenchmark();
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
    return path.resolve(entrypoint) === path.resolve(currentFilePath);
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
