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
import { existsSync } from '@node-singletons/fs';
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
  /** Loads and returns the full ESM module namespace object without unwrapping `default`. */
  getModule: <T extends UnknownModule = UnknownModule>() => Promise<T>;
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
    const fromNpm = processModule.env?.['npm_package_name'];
    if (fromNpm === '@zintrust/core') return true;

    // Vitest suites (notably CoverageBoost) may mock `@node-singletons/fs` to return
    // `existsSync() === true` for everything and `readFileSync() === '{}'`, which makes
    // any package.json-based detection unreliable. Instead, detect a core repo checkout
    // by checking whether this module is being executed from within the current cwd.
    // - core repo tests: import.meta.url points into `<cwd>/src/...`
    // - consumer apps: import.meta.url points into `node_modules/@zintrust/core/...`
    try {
      const cwdAbs = resolve(cwdPath);
      const selfUrl = new URL(import.meta.url);
      const selfPath = decodeURIComponent(selfUrl.pathname);
      const selfAbs = resolve(selfPath);
      return selfAbs === cwdAbs || selfAbs.startsWith(cwdAbs + sep);
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

const isInternalProjectRoot = (projectRoot: string): boolean =>
  pathModule.basename(projectRoot) === '.zintrust-internal-project-root';

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

  if (rootAbs === sep) return candidateAbs;

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

const throwProjectFileNotFound = (
  projectRoot: string,
  relativePath: string,
  candidates: readonly string[]
): never => {
  throw ErrorFactory.createNotFoundError('Project file not found', {
    projectRoot,
    relativePath,
    candidates,
  });
};

const resolveExistingCandidate = (
  isInternalRoot: boolean,
  candidates: readonly string[],
  projectRoot: string,
  relativePath: string
): string => {
  if (isInternalRoot) {
    return throwProjectFileNotFound(projectRoot, relativePath, candidates);
  }

  const candidate = candidates.find((entry) => existsSync(entry));
  if (candidate === undefined) {
    return throwProjectFileNotFound(projectRoot, relativePath, candidates);
  }

  return candidate;
};

const importExistingProjectModule = async <T extends UnknownModule>(
  isInternalRoot: boolean,
  candidates: readonly string[],
  projectRoot: string,
  relativePath: string
): Promise<T> => {
  const candidate = resolveExistingCandidate(isInternalRoot, candidates, projectRoot, relativePath);

  try {
    return (await importModule(candidate)) as T;
  } catch (error: unknown) {
    throw ErrorFactory.createTryCatchError('Failed to import project file', {
      candidate,
      projectRoot,
      relativePath,
      error,
    });
  }
};

const createWorkersUnsupportedLoader = (): FileLoader => {
  const throwUnsupported = (): never => {
    throw ErrorFactory.createConfigError('File loading is not supported in Workers runtime');
  };

  return Object.freeze({
    candidates: () => [],
    path: () => '',
    exists: () => false,
    async get<T = unknown>(): Promise<T> {
      await Promise.resolve();
      return throwUnsupported();
    },
    async getModule<T extends UnknownModule = UnknownModule>(): Promise<T> {
      await Promise.resolve();
      return throwUnsupported();
    },
  });
};

export const useFileLoader = (...args: [string] | [string, ...string[]]): FileLoader => {
  const isWorkersRuntime = (): boolean => {
    const g = globalThis as { CF?: unknown; caches?: unknown; WebSocketPair?: unknown };
    return g.CF !== undefined || g.caches !== undefined || g.WebSocketPair !== undefined;
  };
  if (isWorkersRuntime()) {
    return createWorkersUnsupportedLoader();
  }

  const relativePath =
    args.length === 1
      ? normalizeProjectRelativePath(args[0])
      : normalizeProjectRelativePath(args.join('/'));

  const projectRoot = resolveProjectRoot();
  const isInternalRoot = isInternalProjectRoot(projectRoot);
  const candidates = buildCandidateAbsolutePaths(projectRoot, relativePath);

  // The core repo uses `.zintrust-internal-project-root` as a sentinel during core test runs.
  // In this mode, we must *never* import project config templates.
  // This also avoids test suites that mock `existsSync()` globally (e.g. CoverageBoost).
  const exists = (): boolean => (isInternalRoot ? false : candidates.some((c) => existsSync(c)));

  const resolveFirstExistingPath = (): string => {
    if (isInternalRoot) return candidates[0] ?? resolveWithinProjectRoot(projectRoot, relativePath);
    for (const candidate of candidates) {
      if (existsSync(candidate)) return candidate;
    }
    return candidates[0] ?? resolveWithinProjectRoot(projectRoot, relativePath);
  };

  const get = async <T = unknown>(): Promise<T> => {
    const mod = await importExistingProjectModule<UnknownModule>(
      isInternalRoot,
      candidates,
      projectRoot,
      relativePath
    );
    if (Object.hasOwn(mod, 'default') && mod.default !== undefined) {
      return mod.default as T;
    }
    return mod as unknown as T;
  };

  const getModule = async <T extends UnknownModule = UnknownModule>(): Promise<T> => {
    return importExistingProjectModule<T>(
      isInternalRoot,
      candidates,
      projectRoot,
      relativePath
    );
  };

  return Object.freeze({
    candidates: () => candidates,
    path: resolveFirstExistingPath,
    exists,
    get,
    getModule,
  });
};

export default useFileLoader;
