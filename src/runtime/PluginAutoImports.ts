import { pathToFileURL } from '@/node-singletons/url';
import { readEnvString } from '@common/ExternalServiceUtils';
import { Logger } from '@config/logger';
import { existsSync, readFile } from '@node-singletons/fs';
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

const extractImportSpecifiers = (raw: string): string[] => {
  const specifiers: string[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const match = /^\s*import\s+['"]([^'"]+)['"];?\s*$/.exec(line);
    if (match?.[1] !== null && match?.[1] !== undefined) {
      specifiers.push(match[1]);
    }
  }
  return specifiers;
};

const readImportSpecifiersFromFiles = async (files: string[]): Promise<Set<string>> => {
  const importSpecifiers = new Set<string>();

  // Read all files in parallel
  const fileReadPromises = files.map(async (filePath) => {
    try {
      const raw = await readFile(filePath, 'utf-8');
      return { filePath, specifiers: extractImportSpecifiers(raw), success: true };
    } catch (error) {
      Logger.debug('[plugins] Failed to read auto-import file for fallback', {
        filePath,
        error: error instanceof Error ? error.message : String(error),
      });
      return { filePath, specifiers: [] as string[], success: false };
    }
  });

  const results = await Promise.all(fileReadPromises);

  // Collect all successful specifiers
  for (const { specifiers } of results) {
    for (const specifier of specifiers) {
      importSpecifiers.add(specifier);
    }
  }

  return importSpecifiers;
};

const importSpecifiers = async (specifiers: Iterable<string>): Promise<number> => {
  // Import all specifiers in parallel
  const importPromises = Array.from(specifiers).map(async (specifier) => {
    try {
      await import(specifier);
      Logger.debug('[plugins] Loaded auto-import specifier', { specifier });
      return { specifier, success: true };
    } catch (error) {
      Logger.debug('[plugins] Failed auto-import specifier', {
        specifier,
        error: error instanceof Error ? error.message : String(error),
      });
      return { specifier, success: false };
    }
  });

  const results = await Promise.allSettled(importPromises);

  // Count successful imports
  return results.filter((result) => result.status === 'fulfilled' && result.value.success).length;
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

    // Filter out non-existent candidates first
    const existingCandidates = candidates.filter((candidate) => existsSync(candidate));

    if (existingCandidates.length === 0) {
      Logger.debug('[plugins] No plugin auto-imports file found', { projectRoot, candidates });
      return { ok: false, reason: 'not-found' };
    }

    const tryImportCandidate = async (candidate: string): Promise<ImportResult> => {
      try {
        const url = pathToFileURL(candidate).href;
        await import(url);
        return { ok: true, loadedPath: candidate } as ImportResult;
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          ok: false,
          loadedPath: candidate,
          reason: 'import-failed',
          errorMessage,
        } as ImportResult;
      }
    };

    // Try all existing candidates in parallel
    const importPromises = existingCandidates.map(async (candidate) =>
      tryImportCandidate(candidate)
    );

    // Return the first successful import, or the first failure if none succeed
    try {
      const results = await Promise.allSettled(importPromises);
      const successfulResult = results.find(
        (result): result is PromiseFulfilledResult<ImportResult> =>
          result.status === 'fulfilled' && result.value.ok
      );

      if (successfulResult) {
        return successfulResult.value;
      }

      // Return the first failed result if no success
      const firstFailedResult = results.find(
        (result): result is PromiseFulfilledResult<ImportResult> =>
          result.status === 'fulfilled' && !result.value.ok
      );

      const failed =
        firstFailedResult?.value ??
        ({ ok: false, reason: 'import-failed', errorMessage: 'All candidates failed' } as const);

      Logger.debug('[plugins] Auto-import file failed, attempting per-import fallback', failed);

      const fallbackResult = await this.tryImportFromFileContents(existingCandidates);
      if (fallbackResult.ok) return fallbackResult;

      return failed as ImportResult;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { ok: false, reason: 'import-failed', errorMessage };
    }
  },

  async tryImportFromFileContents(files: string[]): Promise<ImportResult> {
    const specifiers = await readImportSpecifiersFromFiles(files);
    if (specifiers.size === 0) {
      return { ok: false, reason: 'import-failed', errorMessage: 'No import specifiers found' };
    }

    const loaded = await importSpecifiers(specifiers);
    if (loaded > 0) {
      return { ok: true, loadedPath: 'manual-imports' };
    }

    return { ok: false, reason: 'import-failed', errorMessage: 'All specifier imports failed' };
  },
});
