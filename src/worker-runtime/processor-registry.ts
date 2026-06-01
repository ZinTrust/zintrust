/**
 * Bundled processor registry.
 *
 * Cloudflare Workers cannot dynamically `import()` a file path at runtime — the module
 * graph is frozen at build time. So the worker processor functions are statically
 * imported here and exposed as a `processorSpec -> ZinTrustProcessor` map. The Redis RPC
 * backend only stores the `processorSpec` string as metadata; this runtime resolves that
 * string to the already-bundled function when it pulls a job.
 */

import type { Job } from 'bullmq';

export type WorkerProcessor = (job: Job) => Promise<unknown>;

export type WorkerModule = {
  workerDefinition: { processorSpec: string };
  ZinTrustProcessor?: WorkerProcessor;
  default?: WorkerProcessor;
};

const buildRegistry = (
  workerModules: ReadonlyArray<WorkerModule>
): ReadonlyMap<string, WorkerProcessor> => {
  const registry = new Map<string, WorkerProcessor>();
  for (const mod of workerModules) {
    const spec = mod.workerDefinition?.processorSpec;
    const processor = mod.ZinTrustProcessor ?? mod.default;
    if (typeof spec === 'string' && spec.trim().length > 0 && typeof processor === 'function') {
      registry.set(spec, processor);
    }
  }
  return registry;
};

const processorRegistry = (
  workerModules: ReadonlyArray<WorkerModule>
): ReadonlyMap<string, WorkerProcessor> => buildRegistry(workerModules);

export const resolveProcessor = (
  processorSpec: string,
  workerModules: ReadonlyArray<WorkerModule>
): WorkerProcessor | undefined => processorRegistry(workerModules).get(processorSpec);

export const hasProcessor = (
  processorSpec: string,
  workerModules: ReadonlyArray<WorkerModule>
): boolean => processorRegistry(workerModules).has(processorSpec);

export const listProcessorSpecs = (workerModules: ReadonlyArray<WorkerModule>): string[] =>
  Array.from(processorRegistry(workerModules).keys());
