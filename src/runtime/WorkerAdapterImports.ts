// Worker-only adapter auto-imports for bundler-based runtimes (e.g. Cloudflare Workers).
// Keep this list limited to database adapters needed by runtime config.

// These imports resolve against the host project (developer working directory)
// via the @/ alias configured by the ZinTrust app templates.
const tryImportOptional = async (): Promise<void> => {
  try {
    await import('@/zintrust.plugins.wg');
  } catch {
    // Log and swallow errors since these are optional imports that may not exist in all projects.
  }
};

const ready = await tryImportOptional();

export const WorkerAdapterImports = Object.freeze({
  loaded: true,
  ready,
});
