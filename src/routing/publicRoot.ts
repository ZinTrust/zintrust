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
    if (fs.existsSync(path.join(current, 'package.json'))) return current;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return startDir;
};

/**
 * Framework public roots (dist/public preferred).
 */
export const getFrameworkPublicRoots = (): string[] => {
  const thisDir = esmDirname(import.meta.url);
  const packageRoot = findPackageRoot(thisDir);
  return [path.join(packageRoot, 'dist/public'), path.join(packageRoot, 'public')];
};

/**
 * Resolve the effective public root.
 * Prefers app-local `public/` when present; otherwise falls back to framework public roots.
 */
export const getPublicRoot = (): string => {
  const appRoots = [path.join(process.cwd(), 'public')];
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
