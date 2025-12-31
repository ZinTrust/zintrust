import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_ROOT = process.cwd();
const DEFAULT_TARGETS = [
  path.join(DEFAULT_ROOT, 'dist', 'src'),
  path.join(DEFAULT_ROOT, 'dist', 'bin'),
];

const KNOWN_EXTENSIONS = ['.js', '.mjs', '.cjs', '.json', '.node'];

function isFile(p) {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

function isDir(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function listJsFilesRecursive(dir) {
  /** @type {string[]} */
  const out = [];
  if (!isDir(dir)) return out;

  /** @type {string[]} */
  const stack = [dir];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;

    const entries = fs.readdirSync(current, { withFileTypes: true });
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
}

function shouldConsiderSpecifier(specifier) {
  if (!specifier.startsWith('./') && !specifier.startsWith('../')) return false;
  if (specifier.startsWith('./#') || specifier.startsWith('../#')) return false;
  const lower = specifier.toLowerCase();
  return !KNOWN_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

function rewriteSpecifier({ filePath, specifier }) {
  if (!shouldConsiderSpecifier(specifier)) return null;

  // Don’t touch specifiers with query/hash fragments (rare in this repo).
  if (specifier.includes('?') || specifier.includes('#')) return null;

  const baseDir = path.dirname(filePath);
  const resolved = path.resolve(baseDir, specifier);

  // If it already points to a directory, prefer explicit index.js.
  if (isDir(resolved)) {
    const indexJs = path.join(resolved, 'index.js');
    if (isFile(indexJs)) return `${specifier.replace(/\/+$/, '')}/index.js`;
  }

  // Most TS outputs are emitted as .js.
  if (isFile(`${resolved}.js`)) return `${specifier}.js`;

  // If the plain path exists as a file (unusual for our filtered set), leave it.
  if (isFile(resolved)) return null;

  // Could be a missing emit or a non-standard extension; leave unchanged.
  return null;
}

function patchFile(file) {
  const original = fs.readFileSync(file, 'utf8');
  let next = original;
  let replacements = 0;

  // Compiled bin entrypoints must be runnable by plain Node (no tsx hook).
  // The TS sources include a tsx-based shebang; when compiled to JS this breaks
  // global installs because the tsx loader tries to parse JS.
  if (file.includes(`${path.sep}dist${path.sep}bin${path.sep}`)) {
    next = next.replace(
      /^#!\/usr\/bin\/env\s+-S\s+node\s+--(?:import|loader)\s+tsx\s*\r?\n/m,
      '#!/usr/bin/env node\n'
    );
  }

  /**
   * Static imports/exports + bare imports.
   * - import x from './foo'
   * - export * from './foo'
   * - export { x } from './foo'
   * - import './foo'
   */
  next = next.replace(
    /(\b(?:import|export)\b[\s\S]*?\bfrom\s*|\bimport\s*)(['"])(\.{1,2}\/[^'"\n]+?)\2/g,
    (match, prefix, quote, specifier) => {
      const rewritten = rewriteSpecifier({ filePath: file, specifier });
      if (!rewritten) return match;
      replacements += 1;
      return `${prefix}${quote}${rewritten}${quote}`;
    }
  );

  // Dynamic import('...')
  next = next.replace(
    /(\bimport\s*\(\s*)(['"])(\.{1,2}\/[^'"\n]+?)\2(\s*\))/g,
    (match, prefix, quote, specifier, suffix) => {
      const rewritten = rewriteSpecifier({ filePath: file, specifier });
      if (!rewritten) return match;
      replacements += 1;
      return `${prefix}${quote}${rewritten}${quote}${suffix}`;
    }
  );

  if (next === original) return { changed: false, replacements: 0 };

  fs.writeFileSync(file, next, 'utf8');
  return { changed: true, replacements };
}

function main() {
  const targets = process.argv.slice(2);
  const roots =
    targets.length > 0 ? targets.map((t) => path.resolve(DEFAULT_ROOT, t)) : DEFAULT_TARGETS;

  const jsFiles = roots.flatMap((root) => listJsFilesRecursive(root));

  let changedFiles = 0;
  let totalReplacements = 0;

  for (const file of jsFiles) {
    const result = patchFile(file);
    if (result.changed) changedFiles += 1;
    totalReplacements += result.replacements;
  }

  process.stdout.write(
    `✅ Fixed ESM relative imports: ${changedFiles} files, ${totalReplacements} replacements\n`
  );
}

main();
