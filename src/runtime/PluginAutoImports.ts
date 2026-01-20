import { pathToFileURL } from '@/node-singletons/url';
import { Env } from '@config/env';
import { Logger } from '@config/logger';
import { ErrorFactory } from '@exceptions/ZintrustError';
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

const readEnvString = (key: string): string => {
  const anyEnv = Env as { get?: (k: string, d?: string) => string };
  const fromEnv = typeof anyEnv.get === 'function' ? anyEnv.get(key, '') : '';
  if (typeof fromEnv === 'string' && fromEnv.trim() !== '') return fromEnv;
  if (typeof process !== 'undefined') {
    const raw = process.env?.[key];
    if (typeof raw === 'string') return raw;
  }
  return fromEnv ?? '';
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
        // eslint-disable-next-line no-await-in-loop
        await import(url);
        return { ok: true, loadedPath: candidate };
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        Logger.warn('[plugins] Failed to import plugin auto-imports', {
          candidate,
          errorMessage,
        });

        // Keep error creation for consistent structure (but do not throw).
        ErrorFactory.createTryCatchError('Failed to import project plugin auto-imports', {
          candidate,
          error,
        });

        return { ok: false, loadedPath: candidate, reason: 'import-failed', errorMessage };
      }
    }

    Logger.debug('[plugins] No plugin auto-imports file found', { projectRoot, candidates });
    return { ok: false, reason: 'not-found' };
  },
});
