import { Logger } from '@config/logger';
import * as fs from '@node-singletons/fs';
import { createRequire } from '@node-singletons/module';
import * as path from '@node-singletons/path';
import { pathToFileURL } from '@node-singletons/url';

type WorkersModule = typeof import('@zintrust/workers');

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
      if (fs.existsSync(indexJs)) return `${specifier.replace(/\/+$/, '')}/index.js`;
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
    .replace(/\bfrom\s+(['"])(\.[^'"]+)\1/g, rewrite)
    .replace(/\bimport\s+(['"])(\.[^'"]+)\1/g, rewrite)
    .replace(/\bimport\s*\(\s*(['"])(\.[^'"]+)\1\s*\)/g, rewrite);

  if (updated !== text) {
    try {
      fs.writeFileSync(filePath, updated, 'utf8');
    } catch {
      return 0;
    }
  }

  return replacements;
};

const patchWorkersDist = (): PatchResult => {
  if (!isNodeRuntime()) return { replacements: 0, filesChanged: 0 };

  let entryPath: string;
  try {
    const require = createRequire(import.meta.url);
    entryPath = require.resolve('@zintrust/workers');
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

const patchQueueMonitorDist = (): PatchResult => {
  if (!isNodeRuntime()) return { replacements: 0, filesChanged: 0 };

  let entryPath: string;
  try {
    const require = createRequire(import.meta.url);
    entryPath = require.resolve('@zintrust/queue-monitor');
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

const resolveLocalWorkersModuleUrl = (): string | null => {
  if (!isNodeRuntime()) return null;

  const root = process.cwd();
  const candidates = [
    path.join(root, 'dist', 'packages', 'workers', 'src', 'index.js'),
    path.join(root, 'packages', 'workers', 'src', 'index.ts'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return pathToFileURL(candidate).href;
    }
  }

  return null;
};

const importLocalWorkersModule = async (): Promise<WorkersModule | null> => {
  const url = resolveLocalWorkersModuleUrl();
  if (url === null || url === '' || url === undefined) return null;

  try {
    return (await import(url)) as WorkersModule;
  } catch (error) {
    Logger.warn('Failed to import local @zintrust/workers fallback', error as Error);
    return null;
  }
};

let workersModulePromise: Promise<WorkersModule> | undefined;
let patchAttempted = false;
let patchAfterFailureAttempted = false;

export const loadWorkersModule = async (): Promise<WorkersModule> => {
  if (!patchAttempted) {
    patchAttempted = true;
    const workersPatch = patchWorkersDist();
    if (workersPatch.filesChanged > 0) {
      Logger.warn('Rewrote @zintrust/workers ESM specifiers before import', workersPatch);
    }

    const monitorPatch = patchQueueMonitorDist();
    if (monitorPatch.filesChanged > 0) {
      Logger.warn('Rewrote @zintrust/queue-monitor ESM specifiers before import', monitorPatch);
    }
  }

  if (workersModulePromise === undefined) {
    const localFallback = await importLocalWorkersModule();
    if (localFallback) {
      workersModulePromise = Promise.resolve(localFallback);
      return localFallback;
    }
  }

  workersModulePromise ??= import('@zintrust/workers');

  try {
    return await workersModulePromise;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const code = (error as { code?: string } | undefined)?.code;

    if (
      !patchAfterFailureAttempted &&
      code === 'ERR_MODULE_NOT_FOUND' &&
      message.includes('@zintrust/workers')
    ) {
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
  }
};
