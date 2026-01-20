/**
 * Public Root Resolution
 * Determines where framework/app static assets live (public/ or dist/public).
 */

import { esmDirname } from '@common/index';
import * as fs from '@node-singletons/fs';
import * as path from '@node-singletons/path';

/**
 * Find the package root directory.
 */
export const findPackageRoot = (startDir: string): string => {
  let current = startDir;
  for (let i = 0; i < 10; i++) {
    try {
      if (fs.existsSync(path.join(current, 'package.json'))) return current;
    } catch {
      // ignore access errors
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return startDir;
};

/**
 * Find the package root directory (async).
 */
export const findPackageRootAsync = async (startDir: string): Promise<string> => {
  const findUp = async (current: string, depth: number): Promise<string> => {
    if (depth >= 10) return startDir;

    try {
      await fs.fsPromises.access(path.join(current, 'package.json'));
      return current;
    } catch {
      // ignore
    }

    const parent = path.dirname(current);
    if (parent === current) return startDir;

    return findUp(parent, depth + 1);
  };

  return findUp(startDir, 0);
};

/**
 * Framework public roots (dist/public preferred).
 */
export const getFrameworkPublicRoots = (): string[] => {
  const thisDir = esmDirname(import.meta.url);
  const packageRoot = findPackageRoot(thisDir);
  return [path.join(packageRoot, 'dist/public'), path.join(packageRoot, 'public')];
};

export const getFrameworkPublicRootsAsync = async (): Promise<string[]> => {
  const thisDir = esmDirname(import.meta.url);
  const packageRoot = await findPackageRootAsync(thisDir);
  return [path.join(packageRoot, 'dist/public'), path.join(packageRoot, 'public')];
};

// Cache process.cwd() at module load time
const projectCwd = process.cwd();

/**
 * Resolve the effective public root.
 * Prefers app-local `public/` when present; otherwise falls back to framework public roots.
 */
export const getPublicRoot = (): string => {
  const appRoots = [path.join(projectCwd, 'public')];
  const candidates = [...appRoots, ...getFrameworkPublicRoots()];

  // Prefer a root that contains an index.html (common for docs + dev portal).
  const hasIndex = (root: string): boolean => fs.existsSync(path.join(root, 'index.html'));

  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && hasIndex(candidate)) return candidate;
  }

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  return candidates[0];
};

/**
 * Resolve the effective public root (async).
 */
export const getPublicRootAsync = async (): Promise<string> => {
  const appRoots = [path.join(projectCwd, 'public')];
  const fwRoots = await getFrameworkPublicRootsAsync();
  const candidates = [...appRoots, ...fwRoots];

  const exists = async (p: string): Promise<boolean> => {
    try {
      await fs.fsPromises.access(p);
      return true;
    } catch {
      return false;
    }
  };

  const hasIndex = async (root: string): Promise<boolean> => exists(path.join(root, 'index.html'));

  const checks = await Promise.all(
    candidates.map(async (candidate) => {
      const rootExists = await exists(candidate);
      const indexExists = rootExists ? await hasIndex(candidate) : false;
      return { candidate, rootExists, indexExists };
    })
  );

  const withIndex = checks.find((c) => c.indexExists);
  if (withIndex) return withIndex.candidate;

  const firstExisting = checks.find((c) => c.rootExists);
  if (firstExisting) return firstExisting.candidate;

  return candidates[0];
};
