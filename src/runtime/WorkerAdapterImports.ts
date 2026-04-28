// Worker-only adapter auto-imports for bundler-based runtimes (e.g. Cloudflare Workers).
// Keep this list limited to database adapters needed by runtime config.

import { ProjectRuntime } from '@runtime/ProjectRuntime';

const tryImportProjectRuntime = async (): Promise<void> => {
  try {
    ProjectRuntime.set(await import('@/zintrust.runtime.wg'));
    return;
  } catch {
    // continue
  }

  try {
    ProjectRuntime.set(await import('@/zintrust.runtime'));
  } catch {
    // Ignore missing runtime modules. Worker startup can still proceed without them.
  }
};

// These imports resolve against the host project (developer working directory)
// via the @/ alias configured by the ZinTrust app templates.
const tryImportOptional = async (): Promise<void> => {
  await tryImportProjectRuntime();

  await import('@runtime/WorkerProjectPlugins');
};

const ready = tryImportOptional();

export const WorkerAdapterImports = Object.freeze({
  loaded: true,
  ready,
});
