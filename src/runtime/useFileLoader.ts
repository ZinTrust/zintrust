/**
 * Project file loader
 *
 * Loads project-owned files (typically config modules) from the project root.
 *
 * Usage:
 *  - useFileLoader('config/mail.ts').get<TypeMail>()
 *  - useFileLoader('config', 'mail.ts').get<TypeMail>()
 */

import { ErrorFactory } from '@exceptions/ZintrustError';
import { existsSync, readFileSync } from '@node-singletons/fs';
import pathModule, { extname, join, resolve, sep } from '@node-singletons/path';
import processModule from '@node-singletons/process';
import { pathToFileURL } from '@node-singletons/url';

type UnknownModule = Record<string, unknown> & { default?: unknown };

export type FileLoader = Readonly<{
  /** Absolute filesystem candidates (in resolution order). */
  candidates: () => readonly string[];
  /** Returns the first existing candidate path (or the first candidate if none exist). */
  path: () => string;
  /** Whether any candidate exists on disk. */
  exists: () => boolean;
  /**
   * Loads the file via ESM dynamic import and returns:
   * - `default` export when present
   * - otherwise the full module namespace object
   */
  get: <T = unknown>() => Promise<T>;
}>;

const resolveProjectRoot = (): string => {
  const isTestRuntime = (): boolean => {
    const nodeEnv = processModule.env?.['NODE_ENV'];
    const isVitest =
      processModule.env?.['VITEST'] !== undefined ||
      processModule.env?.['VITEST_WORKER_ID'] !== undefined ||
      processModule.env?.['VITEST_POOL_ID'] !== undefined;

    return nodeEnv === 'testing' || isVitest;
  };

  const isCoreRepo = (cwdPath: string): boolean => {
    try {
      const pkgPath = resolve(cwdPath, 'package.json');
      if (!existsSync(pkgPath)) return false;
      const raw = readFileSync(pkgPath, 'utf-8');
      const parsed = JSON.parse(String(raw)) as { name?: unknown };
      return parsed?.name === '@zintrust/core';
    } catch {
      return false;
    }
  };

  const fromEnv = processModule.env?.['ZINTRUST_PROJECT_ROOT'];
  if (typeof fromEnv === 'string' && fromEnv.trim().length > 0) return fromEnv.trim();

  const cwd = processModule.cwd();

  // In the ZinTrust core repo, `config/*.ts` are templates (not consumer app config).
  // During core test runs, we avoid auto-loading them to prevent unexpected overrides.
  // In normal runs, keep the historical behavior (projectRoot = cwd).
  if (isCoreRepo(cwd) && isTestRuntime()) {
    return resolve(cwd, '.zintrust-internal-project-root');
  }

  return cwd;
};

const normalizeProjectRelativePath = (raw: string): string => {
  const value = String(raw ?? '').trim();
  if (value.length === 0) {
    throw ErrorFactory.createConfigError('useFileLoader() requires a non-empty path');
  }

  if (value.includes('\u0000')) {
    throw ErrorFactory.createSecurityError('Invalid file path (null byte)');
  }

  const normalized = value.replaceAll('\\', '/').replace(/^\.\/+/, '');

  if (pathModule.isAbsolute(normalized)) {
    throw ErrorFactory.createSecurityError('Absolute paths are not allowed', { requested: value });
  }

  return normalized;
};

const resolveWithinProjectRoot = (projectRoot: string, relativePath: string): string => {
  const rootAbs = resolve(projectRoot);
  const candidateAbs = resolve(projectRoot, relativePath);

  if (candidateAbs === rootAbs) return candidateAbs;

  if (!candidateAbs.startsWith(rootAbs + sep)) {
    throw ErrorFactory.createSecurityError('Invalid file path (path traversal detected)', {
      projectRoot: rootAbs,
      requested: relativePath,
      resolved: candidateAbs,
    });
  }

  return candidateAbs;
};

const replaceExtension = (filePath: string, nextExt: string): string => {
  const current = extname(filePath);
  if (current.length === 0) return `${filePath}${nextExt}`;
  return filePath.slice(0, -current.length) + nextExt;
};

const unique = (items: string[]): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    if (seen.has(item)) continue;
    seen.add(item);
    out.push(item);
  }
  return out;
};

const buildCandidateAbsolutePaths = (projectRoot: string, relativePath: string): string[] => {
  const ext = extname(relativePath);

  const baseRelCandidates = unique([
    relativePath,
    ...(ext.length === 0
      ? [`${relativePath}.ts`, `${relativePath}.js`, `${relativePath}.mjs`]
      : []),
    ...(ext === '.ts'
      ? [replaceExtension(relativePath, '.js'), replaceExtension(relativePath, '.mjs')]
      : []),
    ...(ext === '.js'
      ? [replaceExtension(relativePath, '.mjs'), replaceExtension(relativePath, '.ts')]
      : []),
    ...(ext === '.mjs'
      ? [replaceExtension(relativePath, '.js'), replaceExtension(relativePath, '.ts')]
      : []),
  ]);

  const absCandidates = baseRelCandidates.flatMap((rel) => [
    resolveWithinProjectRoot(projectRoot, rel),
    resolveWithinProjectRoot(projectRoot, join('dist', rel)),
  ]);

  return unique(absCandidates);
};

const importModule = async (filePath: string): Promise<UnknownModule> => {
  const url = pathToFileURL(filePath).href;
  return (await import(url)) as UnknownModule;
};

export const useFileLoader = (...args: [string] | [string, ...string[]]): FileLoader => {
  const relativePath =
    args.length === 1
      ? normalizeProjectRelativePath(args[0])
      : normalizeProjectRelativePath(args.join('/'));

  const projectRoot = resolveProjectRoot();
  const candidates = buildCandidateAbsolutePaths(projectRoot, relativePath);

  const exists = (): boolean => candidates.some((c) => existsSync(c));

  const resolveFirstExistingPath = (): string => {
    for (const candidate of candidates) {
      if (existsSync(candidate)) return candidate;
    }
    return candidates[0] ?? resolveWithinProjectRoot(projectRoot, relativePath);
  };

  const get = async <T = unknown>(): Promise<T> => {
    const candidate = candidates.find((c) => existsSync(c));
    if (candidate === undefined) {
      throw ErrorFactory.createNotFoundError('Project file not found', {
        projectRoot,
        relativePath,
        candidates,
      });
    }

    try {
      const mod = await importModule(candidate);
      if (Object.hasOwn(mod, 'default') && mod.default !== undefined) {
        return mod.default as T;
      }
      return mod as unknown as T;
    } catch (error: unknown) {
      throw ErrorFactory.createTryCatchError('Failed to import project file', {
        candidate,
        projectRoot,
        relativePath,
        error,
      });
    }
  };

  return Object.freeze({
    candidates: () => candidates,
    path: resolveFirstExistingPath,
    exists,
    get,
  });
};

export default useFileLoader;
