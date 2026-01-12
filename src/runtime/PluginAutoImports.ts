import { pathToFileURL } from '@/node-singletons/url';
import { ErrorFactory } from '@exceptions/ZintrustError';
import { existsSync } from '@node-singletons/fs';
import * as path from '@node-singletons/path';

type ImportResult =
  | { ok: true; loadedPath: string }
  | { ok: false; loadedPath?: string; reason: 'not-found' | 'import-failed' };

const resolveProjectRoot = (): string => {
  const fromEnv = process.env['ZINTRUST_PROJECT_ROOT'];
  if (typeof fromEnv === 'string' && fromEnv.trim().length > 0) return fromEnv.trim();
  return process.cwd();
};

const getCandidates = (projectRoot: string): string[] => {
  return [
    // Dev (tsx)
    path.join(projectRoot, 'src', 'zintrust.plugins.ts'),
    // Production build output (most common)
    path.join(projectRoot, 'dist', 'src', 'zintrust.plugins.js'),
    // Fallback (in case someone transpiles without /dist)
    path.join(projectRoot, 'src', 'zintrust.plugins.js'),
  ];
};

export const PluginAutoImports = Object.freeze({
  /**
   * Best-effort import of a project's `src/zintrust.plugins.ts` file.
   *
   * This file is generated/maintained by `zin plugin install` and contains
   * side-effect imports (e.g. `@zintrust/db-mysql/register`) which register
   * adapters/drivers into core registries.
   */
  async tryImportProjectAutoImports(): Promise<ImportResult> {
    const projectRoot = resolveProjectRoot();
    const candidates = getCandidates(projectRoot);

    for (const candidate of candidates) {
      if (!existsSync(candidate)) continue;

      try {
        const url = pathToFileURL(candidate).href;
        // eslint-disable-next-line no-await-in-loop
        await import(url);
        return { ok: true, loadedPath: candidate };
      } catch (error: unknown) {
        ErrorFactory.createTryCatchError('Failed to import project plugin auto-imports', {
          candidate,
          error,
        });
        return { ok: false, loadedPath: candidate, reason: 'import-failed' };
      }
    }

    return { ok: false, reason: 'not-found' };
  },
});
