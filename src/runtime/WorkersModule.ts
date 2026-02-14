import * as Common from '@/common';
import { Logger } from '@config/logger';
import * as fs from '@node-singletons/fs';
import { createRequire } from '@node-singletons/module';
import * as path from '@node-singletons/path';
import { pathToFileURL } from '@node-singletons/url';

type WorkersModule = typeof import('@zintrust/workers');
type QueueMonitorModule = typeof import('@zintrust/queue-monitor');

type PatchResult = {
  replacements: number;
  filesChanged: number;
};

const KNOWN_EXTENSIONS = ['.js', '.mjs', '.cjs', '.json', '.node'];

const isNodeRuntime = (): boolean =>
  typeof process !== 'undefined' && Boolean(process.versions?.node);

const listJsFilesRecursive = (dir: string): string[] => {
  const out: string[] = [];
  const stack: string[] = [dir];

  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined) continue;

    let entries: Array<{ name: string; isDirectory: () => boolean; isFile: () => boolean }>;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true }) as Array<{
        name: string;
        isDirectory: () => boolean;
        isFile: () => boolean;
      }>;
    } catch {
      continue;
    }

    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
        continue;
      }
      if (entry.isFile() && full.endsWith('.js')) {
        out.push(full);
      }
    }
  }

  return out;
};

const shouldConsiderSpecifier = (specifier: string): boolean => {
  if (!specifier.startsWith('./') && !specifier.startsWith('../')) return false;
  if (specifier.includes('?') || specifier.includes('#')) return false;
  const lower = specifier.toLowerCase();
  return !KNOWN_EXTENSIONS.some((ext) => lower.endsWith(ext));
};

const resolveSpecifier = (filePath: string, specifier: string): string | null => {
  if (!shouldConsiderSpecifier(specifier)) return null;

  const baseDir = path.dirname(filePath);
  const resolved = path.resolve(baseDir, specifier);

  try {
    if (fs.statSync(resolved).isDirectory()) {
      const indexJs = path.join(resolved, 'index.js');
      if (fs.existsSync(indexJs))
        return `${specifier.endsWith('/') ? specifier.slice(0, -1) : specifier}/index.js`;
    }
  } catch {
    // ignore stat errors
  }

  if (fs.existsSync(`${resolved}.js`)) return `${specifier}.js`;

  return null;
};

const patchImportsInFile = (filePath: string): number => {
  let text: string;
  try {
    text = fs.readFileSync(filePath, 'utf8');
  } catch {
    return 0;
  }

  let replacements = 0;

  const rewrite = (match: string, quote: string, specifier: string): string => {
    const next = resolveSpecifier(filePath, specifier);
    if (next === null) return match;
    replacements += 1;
    return match.replace(`${quote}${specifier}${quote}`, `${quote}${next}${quote}`);
  };

  const updated = text
    .replaceAll(/\bfrom\s+(['"])(\.[^'"]+)\1/g, rewrite)
    .replaceAll(/\bimport\s+(['"])(\.[^'"]+)\1/g, rewrite)
    .replaceAll(/\bimport\s*\(\s*(['"])(\.[^'"]+)\1\s*\)/g, rewrite);

  if (updated !== text) {
    try {
      fs.writeFileSync(filePath, updated, 'utf8');
    } catch {
      return 0;
    }
  }

  return replacements;
};

const patchPackageDist = (
  packageName: '@zintrust/workers' | '@zintrust/queue-monitor'
): PatchResult => {
  if (!isNodeRuntime()) return { replacements: 0, filesChanged: 0 };

  let entryPath: string;
  try {
    const require = createRequire(import.meta.url);
    entryPath = require.resolve(packageName);
  } catch {
    return { replacements: 0, filesChanged: 0 };
  }

  const distDir = path.dirname(entryPath);
  if (!fs.existsSync(distDir)) return { replacements: 0, filesChanged: 0 };

  const files = listJsFilesRecursive(distDir);
  let replacements = 0;
  let filesChanged = 0;

  for (const file of files) {
    const changes = patchImportsInFile(file);
    if (changes > 0) {
      replacements += changes;
      filesChanged += 1;
    }
  }

  return { replacements, filesChanged };
};

const patchWorkersDist = (): PatchResult => patchPackageDist('@zintrust/workers');

const patchQueueMonitorDist = (): PatchResult => patchPackageDist('@zintrust/queue-monitor');

const resolveLocalModuleUrl = (packageDir: 'workers' | 'queue-monitor'): string | null => {
  if (!isNodeRuntime()) return null;

  const root = process.cwd();

  const mode = (process.env['NODE_ENV'] ?? 'development').toString().trim().toLowerCase();
  const isProductionMode = mode === 'production' || mode === 'pro' || mode === 'prod';
  const runFromSource = typeof Common.runFromSource === 'function' ? Common.runFromSource() : false;
  const preferSource = runFromSource || !isProductionMode;

  const candidates = preferSource
    ? [
        path.join(root, 'packages', packageDir, 'src', 'index.ts'),
        path.join(root, 'dist', 'packages', packageDir, 'src', 'index.js'),
      ]
    : [
        path.join(root, 'dist', 'packages', packageDir, 'src', 'index.js'),
        path.join(root, 'packages', packageDir, 'src', 'index.ts'),
      ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return pathToFileURL(candidate).href;
    }
  }

  return null;
};

const importLocalModule = async <T>(
  packageDir: 'workers' | 'queue-monitor',
  packageName: string
): Promise<T | null> => {
  const url = resolveLocalModuleUrl(packageDir);
  if (url === null || url === '' || url === undefined) return null;

  try {
    return (await import(url)) as T;
  } catch (error) {
    Logger.warn(`Failed to import local ${packageName} fallback`, error as Error);
    return null;
  }
};

const importLocalWorkersModule = async (): Promise<WorkersModule | null> =>
  importLocalModule<WorkersModule>('workers', '@zintrust/workers');

const importLocalQueueMonitorModule = async (): Promise<QueueMonitorModule | null> =>
  importLocalModule<QueueMonitorModule>('queue-monitor', '@zintrust/queue-monitor');

let workersModulePromise: Promise<WorkersModule> | undefined;
let patchAttempted = false;
let patchAfterFailureAttempted = false;
let queueMonitorModulePromise: Promise<QueueMonitorModule> | undefined;
let queueMonitorPatchAfterFailureAttempted = false;

const applyInitialPatches = (): void => {
  if (patchAttempted) return;

  patchAttempted = true;
  const workersPatch = patchWorkersDist();
  if (workersPatch.filesChanged > 0) {
    Logger.warn('Rewrote @zintrust/workers ESM specifiers before import', workersPatch);
  }

  const monitorPatch = patchQueueMonitorDist();
  if (monitorPatch.filesChanged > 0) {
    Logger.warn('Rewrote @zintrust/queue-monitor ESM specifiers before import', monitorPatch);
  }
};

const shouldRetryAfterFailure = (error: unknown): boolean => {
  if (patchAfterFailureAttempted) return false;

  const message = error instanceof Error ? error.message : String(error);
  const code = (error as { code?: string } | undefined)?.code;

  return code === 'ERR_MODULE_NOT_FOUND' && message.includes('@zintrust/workers');
};

const handleImportFailure = async (error: unknown): Promise<WorkersModule> => {
  if (shouldRetryAfterFailure(error)) {
    patchAfterFailureAttempted = true;
    const { replacements, filesChanged } = patchWorkersDist();
    if (filesChanged > 0) {
      Logger.warn('Rewrote @zintrust/workers ESM specifiers after import failure', {
        filesChanged,
        replacements,
      });
      workersModulePromise = import('@zintrust/workers');
      return workersModulePromise;
    }
  }

  const localFallback = await importLocalWorkersModule();
  if (localFallback) {
    workersModulePromise = Promise.resolve(localFallback);
    return localFallback;
  }

  throw error;
};

const tryLocalFallback = async (): Promise<WorkersModule | null> => {
  const localFallback = await importLocalWorkersModule();
  if (localFallback) {
    workersModulePromise = Promise.resolve(localFallback);
    return localFallback;
  }
  return null;
};

export const loadWorkersModule = async (): Promise<WorkersModule> => {
  applyInitialPatches();

  if (workersModulePromise === undefined) {
    const localFallback = await tryLocalFallback();
    if (localFallback) {
      return localFallback;
    }
  }

  workersModulePromise ??= import('@zintrust/workers');

  try {
    return await workersModulePromise;
  } catch (error: unknown) {
    return handleImportFailure(error);
  }
};

const shouldRetryQueueMonitorAfterFailure = (error: unknown): boolean => {
  if (queueMonitorPatchAfterFailureAttempted) return false;

  const message = error instanceof Error ? error.message : String(error);
  const code = (error as { code?: string } | undefined)?.code;

  return code === 'ERR_MODULE_NOT_FOUND' && message.includes('@zintrust/queue-monitor');
};

const handleQueueMonitorImportFailure = async (error: unknown): Promise<QueueMonitorModule> => {
  if (shouldRetryQueueMonitorAfterFailure(error)) {
    queueMonitorPatchAfterFailureAttempted = true;
    const { replacements, filesChanged } = patchQueueMonitorDist();
    if (filesChanged > 0) {
      Logger.warn('Rewrote @zintrust/queue-monitor ESM specifiers after import failure', {
        filesChanged,
        replacements,
      });
      queueMonitorModulePromise = import('@zintrust/queue-monitor');
      return queueMonitorModulePromise;
    }
  }

  const localFallback = await importLocalQueueMonitorModule();
  if (localFallback) {
    queueMonitorModulePromise = Promise.resolve(localFallback);
    return localFallback;
  }

  throw error;
};

const tryQueueMonitorLocalFallback = async (): Promise<QueueMonitorModule | null> => {
  const localFallback = await importLocalQueueMonitorModule();
  if (localFallback) {
    queueMonitorModulePromise = Promise.resolve(localFallback);
    return localFallback;
  }
  return null;
};

export const loadQueueMonitorModule = async (): Promise<QueueMonitorModule> => {
  applyInitialPatches();

  if (queueMonitorModulePromise === undefined) {
    const localFallback = await tryQueueMonitorLocalFallback();
    if (localFallback) {
      return localFallback;
    }
  }

  queueMonitorModulePromise ??= import('@zintrust/queue-monitor');

  try {
    return await queueMonitorModulePromise;
  } catch (error: unknown) {
    return handleQueueMonitorImportFailure(error);
  }
};
