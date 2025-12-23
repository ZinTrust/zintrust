/**
 * Establish Performance Baseline
 * Run all code generator benchmarks and save baseline metrics
 */

import { Logger } from '@config/logger';
import { CodeGenerationBenchmark } from '@performance/CodeGenerationBenchmark';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Run baseline and save results
 */
export async function establishBaseline(): Promise<void> {
  Logger.info('📊 Establishing Performance Baseline...');

  const benchmark = CodeGenerationBenchmark();
  await benchmark.runAll();

  // Save baseline
  const baselineFile = path.join(process.cwd(), 'performance-baseline.json');
  benchmark.exportResults(baselineFile);

  Logger.info('✅ Baseline established and saved to performance-baseline.json');
  Logger.info('📈 Next: Run optimizations and compare results');
}

// Run if called directly
type GlobalWithBaselineMainFlag = typeof globalThis & {
  __ZINTRUST_ESTABLISH_BASELINE_MAIN__?: boolean;
};

function isMainModuleEsm(): boolean {
  try {
    const entry = process.argv[1];
    if (entry === undefined || entry === '') return false;

    const currentFilePath = fileURLToPath(new URL(import.meta.url));

    // Use realpathSync to handle symlinks (common on macOS /var -> /private/var)
    if (!('realpathSync' in fs)) {
      return path.resolve(entry) === path.resolve(currentFilePath);
    }

    try {
      const realpathSync = (fs as unknown as { realpathSync: (value: string) => string })
        .realpathSync;
      return realpathSync(entry) === realpathSync(currentFilePath);
    } catch (err) {
      Logger.error('realpathSync failed, falling back to path.resolve', err);
      return path.resolve(entry) === path.resolve(currentFilePath);
    }
  } catch (err) {
    Logger.error('❌ Baseline failed:', err);
    return false;
  }
}

const isMainModule =
  (globalThis as GlobalWithBaselineMainFlag).__ZINTRUST_ESTABLISH_BASELINE_MAIN__ ??
  isMainModuleEsm();

if (isMainModule) {
  await establishBaseline().catch((err) => {
    Logger.error('❌ Baseline failed:', err);
    process.exit(1);
  });
}
