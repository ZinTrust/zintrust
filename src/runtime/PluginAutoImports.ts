import { pathToFileURL } from '@/node-singletons/url';
import { readEnvString } from '@common/ExternalServiceUtils';
import { Logger } from '@config/logger';
import { existsSync } from '@node-singletons/fs';
import * as path from '@node-singletons/path';

type ImportResult =
  | { ok: true; loadedPath: string }
  | {
      ok: false;
      loadedPath?: string;
      reason: 'not-found' | 'import-failed';
      errorMessage?: string;
    };

const getProjectCwd = (): string => process.cwd();
const getProjectRootEnv = (): string => readEnvString('ZINTRUST_PROJECT_ROOT');

const resolveProjectRoot = (): string => {
  const projectRootEnv = getProjectRootEnv();
  if (projectRootEnv.trim().length > 0) {
    return projectRootEnv.trim();
  }
  return getProjectCwd();
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
        await import(url);
        return { ok: true, loadedPath: candidate };
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return { ok: false, loadedPath: candidate, reason: 'import-failed', errorMessage };
      }
    }

    Logger.debug('[plugins] No plugin auto-imports file found', { projectRoot, candidates });
    return { ok: false, reason: 'not-found' };
  },
});
