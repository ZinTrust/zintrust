/**
 * Establish Performance Baseline
 * Run all code generator benchmarks and save baseline metrics
 */

import { Logger } from '@config/logger';
import { CodeGenerationBenchmark } from '@performance/CodeGenerationBenchmark';
import * as path from 'node:path';

/**
 * Run baseline and save results
 */
export async function establishBaseline(): Promise<void> {
  Logger.info('📊 Establishing Performance Baseline...');

  const benchmark = new CodeGenerationBenchmark();
  await benchmark.runAll();

  // Save baseline
  const baselineFile = path.join(process.cwd(), 'performance-baseline.json');
  benchmark.exportResults(baselineFile);

  Logger.info('✅ Baseline established and saved to performance-baseline.json');
  Logger.info('📈 Next: Run optimizations and compare results');
}

// Run if called directly
if (require.main === module) {
  await establishBaseline().catch((err) => {
    Logger.error('❌ Baseline failed:', err);
    process.exit(1);
  });
}
