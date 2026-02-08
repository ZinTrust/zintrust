// Worker-only adapter auto-imports for bundler-based runtimes (e.g. Cloudflare Workers).
// Keep this list limited to database adapters needed by runtime config.

// These imports resolve against the host project (developer working directory)
// via the @/ alias configured by the ZinTrust app templates.
import '@/zintrust.plugins.ts';
import '@/zintrust.plugins.wg.ts';

export const WorkerAdapterImports = Object.freeze({
  loaded: true,
});
