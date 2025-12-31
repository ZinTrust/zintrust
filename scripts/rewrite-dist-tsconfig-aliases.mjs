import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_ROOT = process.cwd();

const KNOWN_IMPORT_EXTENSIONS = ['.js', '.mjs', '.cjs', '.json', '.node'];

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

function readJson(jsonPath) {
  return JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
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

function posixify(p) {
  return p.split(path.sep).join('/');
}

function hasKnownExtension(specifier) {
  const lower = specifier.toLowerCase();
  return KNOWN_IMPORT_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/**
 * @typedef {{ key: string; target: string; kind: 'exact' | 'wildcard'; regex?: RegExp }} Alias
 */

function buildAliasesFromTsconfig(tsconfigPath) {
  const tsconfig = readJson(tsconfigPath);
  const compilerOptions = tsconfig.compilerOptions ?? {};
  const outDirRaw = compilerOptions.outDir ?? './dist';
  const paths = compilerOptions.paths ?? {};

  const outDir = path.resolve(DEFAULT_ROOT, outDirRaw);

  /** @type {Alias[]} */
  const aliases = [];

  for (const [key, values] of Object.entries(paths)) {
    if (!Array.isArray(values) || values.length === 0) continue;

    // The first mapping is the canonical one.
    const first = String(values[0]);

    if (key.includes('*')) {
      // Convert '@foo/*' -> '^@foo/(.+)$'
      const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\*/g, '(.+)');
      const regex = new RegExp(`^${escaped}$`);
      aliases.push({ key, target: first, kind: 'wildcard', regex });
    } else {
      aliases.push({ key, target: first, kind: 'exact' });
    }
  }

  // Prefer longer keys first (more specific).
  aliases.sort((a, b) => b.key.length - a.key.length);

  return { outDir, aliases };
}

function resolveAliasToDistFile({ outDir, alias, specifier }) {
  // tsconfig paths are relative to repo root in this project.
  // We want a *dist* path, since we rewrite compiled JS imports.
  let targetPath;

  if (alias.kind === 'exact') {
    if (specifier !== alias.key) return null;
    targetPath = alias.target;
  } else {
    const match = alias.regex?.exec(specifier);
    if (!match) return null;
    const wildcardValue = match[1] ?? '';
    targetPath = alias.target.replace('*', wildcardValue);
  }

  // Example targetPath: './src/common/index.ts'
  const normalized = targetPath.replace(/^\.\//, '');

  // Strip TS extensions and map to JS emit.
  const withoutExt = normalized.replace(/\.(ts|tsx)$/, '');

  const distCandidate = path.resolve(outDir, `${withoutExt}.js`);
  if (isFile(distCandidate)) return distCandidate;

  // If the path points to a directory mapping, try index.js.
  const distDirCandidate = path.resolve(outDir, withoutExt);
  if (isDir(distDirCandidate)) {
    const indexJs = path.join(distDirCandidate, 'index.js');
    if (isFile(indexJs)) return indexJs;
  }

  // Some path mappings might already omit extensions.
  if (isFile(path.resolve(outDir, withoutExt))) return path.resolve(outDir, withoutExt);

  return null;
}

function toRelativeSpecifier({ fromFile, toFile }) {
  const fromDir = path.dirname(fromFile);
  let rel = path.relative(fromDir, toFile);
  rel = posixify(rel);
  if (!rel.startsWith('./') && !rel.startsWith('../')) rel = `./${rel}`;
  return rel;
}

function rewriteSpecifier({ filePath, specifier, outDir, aliases }) {
  // Skip relative imports and node built-ins and URLs.
  if (specifier.startsWith('./') || specifier.startsWith('../')) return null;
  if (specifier.startsWith('node:')) return null;
  if (specifier.startsWith('http:') || specifier.startsWith('https:')) return null;

  for (const alias of aliases) {
    const resolved = resolveAliasToDistFile({ outDir, alias, specifier });
    if (!resolved) continue;

    let relative = toRelativeSpecifier({ fromFile: filePath, toFile: resolved });

    // Ensure ESM-friendly extension.
    if (!hasKnownExtension(relative)) {
      if (isDir(path.resolve(path.dirname(filePath), relative))) {
        // Prefer explicit index.js
        relative = `${relative.replace(/\/+$/, '')}/index.js`;
      } else {
        relative = `${relative}.js`;
      }
    }

    return relative;
  }

  return null;
}

function patchFile({ file, outDir, aliases }) {
  const original = fs.readFileSync(file, 'utf8');
  let next = original;
  let replacements = 0;

  /**
   * Static imports/exports + bare imports.
   * - import x from '...'
   * - export * from '...'
   * - export { x } from '...'
   * - import '...'
   */
  next = next.replace(
    /(\b(?:import|export)\b[\s\S]*?\bfrom\s*|\bimport\s*)(['"])([^'"\n]+?)\2/g,
    (match, prefix, quote, specifier) => {
      const rewritten = rewriteSpecifier({ filePath: file, specifier, outDir, aliases });
      if (!rewritten) return match;
      replacements += 1;
      return `${prefix}${quote}${rewritten}${quote}`;
    }
  );

  // Dynamic import('...')
  next = next.replace(
    /(\bimport\s*\(\s*)(['"])([^'"\n]+?)\2(\s*\))/g,
    (match, prefix, quote, specifier, suffix) => {
      const rewritten = rewriteSpecifier({ filePath: file, specifier, outDir, aliases });
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
  const tsconfigPath = path.resolve(DEFAULT_ROOT, 'tsconfig.json');
  if (!isFile(tsconfigPath)) {
    throw new Error(`tsconfig.json not found at ${tsconfigPath}`);
  }

  const { outDir, aliases } = buildAliasesFromTsconfig(tsconfigPath);

  const targets = [path.join(outDir, 'src'), path.join(outDir, 'bin')];
  const jsFiles = targets.flatMap((t) => listJsFilesRecursive(t));

  let changedFiles = 0;
  let totalReplacements = 0;

  for (const file of jsFiles) {
    const result = patchFile({ file, outDir, aliases });
    if (result.changed) changedFiles += 1;
    totalReplacements += result.replacements;
  }

  process.stdout.write(
    `✅ Rewrote tsconfig path aliases in dist: ${changedFiles} files, ${totalReplacements} replacements\n`
  );
}

main();
