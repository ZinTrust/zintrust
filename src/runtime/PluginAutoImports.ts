import { readEnvString } from '@common/ExternalServiceUtils';
import { Logger } from '@config/logger';
import { existsSync, readFile } from '@node-singletons/fs';
import * as path from '@node-singletons/path';
import { pathToFileURL } from '@node-singletons/url';
import { OfficialPlugins, type OfficialPluginImageMode } from '@runtime/OfficialPlugins';

type ImportResult =
  | { ok: true; loadedPath: string }
  | {
      ok: false;
      loadedPath?: string;
      reason: 'not-found' | 'import-failed';
      errorMessage?: string;
    };

type SingleImportStatus = 'loaded' | 'missing' | 'failed';

type ImportSummary = {
  loaded: number;
  missing: number;
  failed: number;
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

type ImportSpecifier = { specifier: string; filePath: string };

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

const readImportSpecifiersFromFiles = async (files: string[]): Promise<ImportSpecifier[]> => {
  const importSpecifiers: ImportSpecifier[] = [];

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
  for (const { filePath, specifiers } of results) {
    for (const specifier of specifiers) {
      importSpecifiers.push({ specifier, filePath });
    }
  }

  return importSpecifiers;
};

const resolveRelativeSpecifier = (entry: ImportSpecifier): string => {
  const baseDir = path.dirname(entry.filePath);
  const basePath = path.resolve(baseDir, entry.specifier);
  const candidates = [
    basePath,
    `${basePath}.js`,
    `${basePath}.ts`,
    path.join(basePath, 'index.js'),
    path.join(basePath, 'index.ts'),
  ];

  const resolved = candidates.find((candidate) => existsSync(candidate)) ?? basePath;
  return pathToFileURL(resolved).href;
};

const resolveLocalPackageSpecifier = (specifier: string): string | null => {
  if (!specifier.startsWith('@zintrust/')) return null;

  const projectRoot = resolveProjectRoot();
  const withoutScope = specifier.slice('@zintrust/'.length);
  const segments = withoutScope.split('/');
  const packageName = segments[0];
  const subpath = segments.slice(1).join('/');
  const basename = subpath === '' ? 'index.js' : `${subpath}.js`;
  const sourceBasename = subpath === '' ? 'index.ts' : `${subpath}.ts`;

  const candidates = [
    path.join(projectRoot, 'dist', 'packages', packageName, 'dist', basename),
    path.join(projectRoot, 'dist', 'packages', packageName, 'src', basename),
    path.join(projectRoot, 'dist', 'packages', packageName, 'src', sourceBasename),
    path.join(projectRoot, 'packages', packageName, 'dist', basename),
    path.join(projectRoot, 'packages', packageName, 'src', basename),
    path.join(projectRoot, 'packages', packageName, 'src', sourceBasename),
  ];

  const resolved = candidates.find((candidate) => existsSync(candidate));
  if (resolved === undefined) return null;
  return pathToFileURL(resolved).href;
};

const isMissingPackageImport = (error: unknown, specifier: string): boolean => {
  if (specifier.startsWith('.')) return false;
  if (error === null || typeof error !== 'object') return false;

  const maybe = error as { code?: unknown; message?: unknown };
  const message = typeof maybe.message === 'string' ? maybe.message : '';

  if (maybe.code === 'ERR_MODULE_NOT_FOUND' && message.length === 0) return true;
  if (maybe.code === 'ERR_MODULE_NOT_FOUND' && message.includes(specifier)) return true;

  return (
    message.includes(`Cannot find package '${specifier}'`) ||
    message.includes(`Cannot find module '${specifier}'`)
  );
};

const getMissingPackageStatus = (error: unknown, specifier: string): SingleImportStatus => {
  if (isMissingPackageImport(error, specifier)) {
    Logger.debug('[plugins] Optional auto-import package not installed', {
      specifier,
    });
    return 'missing';
  }

  return 'failed';
};

const importFromLocalFallback = async (
  specifier: string,
  fallback: string
): Promise<SingleImportStatus> => {
  try {
    await import(fallback);
    Logger.debug('[plugins] Loaded auto-import specifier from local fallback', {
      specifier,
      fallback,
    });
    return 'loaded';
  } catch (fallbackError) {
    Logger.debug('[plugins] Failed auto-import local fallback', {
      specifier,
      fallback,
      error: fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
    });

    return getMissingPackageStatus(fallbackError, specifier);
  }
};

const importSingleSpecifier = async (entry: ImportSpecifier): Promise<SingleImportStatus> => {
  const target = entry.specifier.startsWith('.')
    ? resolveRelativeSpecifier(entry)
    : entry.specifier;

  try {
    await import(target);
    Logger.debug('[plugins] Loaded auto-import specifier', { specifier: entry.specifier });
    return 'loaded';
  } catch (error) {
    const fallback = resolveLocalPackageSpecifier(entry.specifier);
    if (fallback !== null) return importFromLocalFallback(entry.specifier, fallback);
    return getMissingPackageStatus(error, entry.specifier);
  }
};

const importSpecifiers = async (specifiers: Iterable<ImportSpecifier>): Promise<ImportSummary> => {
  // Import all specifiers in parallel
  const importPromises = Array.from(specifiers).map(async (entry) => {
    const status = await importSingleSpecifier(entry);
    return { specifier: entry.specifier, status };
  });

  const results = await Promise.allSettled(importPromises);

  return results.reduce<ImportSummary>(
    (summary, result) => {
      if (result.status !== 'fulfilled') {
        summary.failed += 1;
        return summary;
      }

      if (result.value.status === 'loaded') summary.loaded += 1;
      else if (result.value.status === 'missing') summary.missing += 1;
      else summary.failed += 1;

      return summary;
    },
    { loaded: 0, missing: 0, failed: 0 }
  );
};

export const PluginAutoImports = Object.freeze({
  async tryImportRuntimeAutoImports(mode: OfficialPluginImageMode = 'base'): Promise<ImportResult> {
    const specifiers = OfficialPlugins.getAutoImports(mode);
    const summary = await importSpecifiers(
      specifiers.map((specifier) => ({ specifier, filePath: `official:${mode}` }))
    );

    if (summary.failed === 0) {
      return { ok: true, loadedPath: `official:${mode}` };
    }

    return {
      ok: false,
      loadedPath: `official:${mode}`,
      reason: 'import-failed',
      errorMessage: `Loaded ${summary.loaded}/${specifiers.length} official plugin imports`,
    };
  },

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
    if (specifiers.length === 0) {
      return { ok: false, reason: 'import-failed', errorMessage: 'No import specifiers found' };
    }

    const summary = await importSpecifiers(specifiers);
    if (summary.loaded > 0) {
      return { ok: true, loadedPath: 'manual-imports' };
    }

    return { ok: false, reason: 'import-failed', errorMessage: 'All specifier imports failed' };
  },
});
