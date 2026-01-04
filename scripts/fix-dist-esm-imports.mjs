import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_ROOT = process.cwd();
const DEFAULT_TARGETS = [
  path.join(DEFAULT_ROOT, 'dist', 'src'),
  path.join(DEFAULT_ROOT, 'dist', 'bin'),
  // Compiled framework app/ + routes/ are runtime-loaded by Node and must be valid ESM.
  path.join(DEFAULT_ROOT, 'dist', 'app'),
  path.join(DEFAULT_ROOT, 'dist', 'routes'),
];

const KNOWN_EXTENSIONS = ['.js', '.mjs', '.cjs', '.json', '.node'];

function trimTrailingSlashes(value) {
  let end = value.length;
  while (end > 0 && value[end - 1] === '/') end -= 1;
  return end === value.length ? value : value.slice(0, end);
}

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
    if (isFile(indexJs)) return `${trimTrailingSlashes(specifier)}/index.js`;
  }

  // Most TS outputs are emitted as .js.
  if (isFile(`${resolved}.js`)) return `${specifier}.js`;

  // If the plain path exists as a file (unusual for our filtered set), leave it.
  if (isFile(resolved)) return null;

  // Could be a missing emit or a non-standard extension; leave unchanged.
  return null;
}

function isWordChar(ch) {
  return (
    (ch >= 'a' && ch <= 'z') ||
    (ch >= 'A' && ch <= 'Z') ||
    (ch >= '0' && ch <= '9') ||
    ch === '_' ||
    ch === '$'
  );
}

function isKeywordAt(text, i, kw) {
  if (text.startsWith(kw, i) !== true) return false;
  const before = i > 0 ? text[i - 1] : '';
  const after = i + kw.length < text.length ? text[i + kw.length] : '';
  if (before && isWordChar(before)) return false;
  if (after && isWordChar(after)) return false;
  return true;
}

function skipWs(text, i) {
  while (i < text.length) {
    const ch = text[i];
    if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n') {
      i += 1;
      continue;
    }
    break;
  }
  return i;
}

function readQuotedLiteral(text, startQuoteIndex) {
  const quote = text[startQuoteIndex];
  if (quote !== "'" && quote !== '"' && quote !== '`') return null;

  let i = startQuoteIndex + 1;
  let value = '';
  let sawTemplateExpr = false;

  while (i < text.length) {
    const ch = text[i];

    if (quote === '`' && ch === '$' && text[i + 1] === '{') {
      sawTemplateExpr = true;
    }

    if (ch === '\\') {
      // Preserve escapes as literal content for specifier evaluation.
      if (i + 1 < text.length) {
        value += text.slice(i, i + 2);
        i += 2;
        continue;
      }
      value += ch;
      i += 1;
      continue;
    }

    if (ch === quote) {
      return {
        quote,
        value,
        endIndex: i + 1,
        sawTemplateExpr,
      };
    }

    value += ch;
    i += 1;
  }

  return null;
}

function createScanState() {
  return {
    inLineComment: false,
    inBlockComment: false,
    inSingle: false,
    inDouble: false,
    inTemplate: false,
  };
}

function advance(ctx, n) {
  ctx.i += n;
}

function consumeInLineComment(ctx, ch) {
  if (ch === '\n') ctx.state.inLineComment = false;
  advance(ctx, 1);
}

function consumeInBlockComment(ctx, ch, next) {
  if (ch === '*' && next === '/') {
    ctx.state.inBlockComment = false;
    advance(ctx, 2);
    return;
  }
  advance(ctx, 1);
}

function consumeInQuoted(ctx, ch, endChar, flagName) {
  if (ch === '\\') {
    advance(ctx, 2);
    return;
  }
  if (ch === endChar) ctx.state[flagName] = false;
  advance(ctx, 1);
}

function consumeStringOrComment(ctx) {
  const { text, state } = ctx;
  const ch = text[ctx.i];
  const next = ctx.i + 1 < text.length ? text[ctx.i + 1] : '';

  if (state.inLineComment) {
    consumeInLineComment(ctx, ch);
    return true;
  }
  if (state.inBlockComment) {
    consumeInBlockComment(ctx, ch, next);
    return true;
  }
  if (state.inSingle) {
    consumeInQuoted(ctx, ch, "'", 'inSingle');
    return true;
  }
  if (state.inDouble) {
    consumeInQuoted(ctx, ch, '"', 'inDouble');
    return true;
  }
  if (state.inTemplate) {
    consumeInQuoted(ctx, ch, '`', 'inTemplate');
    return true;
  }

  /** @type {{ cond: boolean, run: () => void }[]} */
  const starters = [
    {
      cond: ch === '/' && next === '/',
      run: () => {
        state.inLineComment = true;
        advance(ctx, 2);
      },
    },
    {
      cond: ch === '/' && next === '*',
      run: () => {
        state.inBlockComment = true;
        advance(ctx, 2);
      },
    },
    {
      cond: ch === "'",
      run: () => {
        state.inSingle = true;
        advance(ctx, 1);
      },
    },
    {
      cond: ch === '"',
      run: () => {
        state.inDouble = true;
        advance(ctx, 1);
      },
    },
    {
      cond: ch === '`',
      run: () => {
        state.inTemplate = true;
        advance(ctx, 1);
      },
    },
  ];

  for (const s of starters) {
    if (s.cond) {
      s.run();
      return true;
    }
  }

  return false;
}

function applyRewrite(ctx, quoteIndex, literal, rewritten) {
  ctx.out += ctx.text.slice(ctx.lastFlush, quoteIndex + 1);
  ctx.out += rewritten;
  ctx.out += ctx.text.slice(literal.endIndex - 1, literal.endIndex);
  ctx.lastFlush = literal.endIndex;
  ctx.replacements += 1;
}

function scanForFromSpecifier(ctx, startIndex) {
  // Scan until ';' or newline, then look for: from <ws> ('|"|`)
  const { text } = ctx;
  let scan = startIndex;
  while (scan < text.length) {
    if (text[scan] === ';' || text[scan] === '\n') return null;
    if (isKeywordAt(text, scan, 'from')) {
      const quoteIndex = skipWs(text, scan + 4);
      const q = text[quoteIndex];
      if (q === "'" || q === '"' || q === '`') {
        return { quoteIndex, literal: readQuotedLiteral(text, quoteIndex) };
      }
    }
    scan += 1;
  }
  return null;
}

function handleDynamicImport(ctx, afterImportIndex) {
  const { text, filePath } = ctx;
  if (text[afterImportIndex] !== '(') return false;

  const quoteIndex = skipWs(text, afterImportIndex + 1);
  const literal = readQuotedLiteral(text, quoteIndex);
  if (!literal || literal.sawTemplateExpr) return true;

  const rewritten = rewriteSpecifier({ filePath, specifier: literal.value });
  if (rewritten) applyRewrite(ctx, quoteIndex, literal, rewritten);
  return true;
}

function handleSideEffectImport(ctx, afterImportIndex) {
  const { text, filePath } = ctx;
  const q = text[afterImportIndex];
  if (q !== "'" && q !== '"' && q !== '`') return false;

  const literal = readQuotedLiteral(text, afterImportIndex);
  if (!literal || literal.sawTemplateExpr) return true;

  const rewritten = rewriteSpecifier({ filePath, specifier: literal.value });
  if (rewritten) applyRewrite(ctx, afterImportIndex, literal, rewritten);
  return true;
}

function handleStaticImportFrom(ctx, afterImportIndex) {
  const { filePath } = ctx;
  const found = scanForFromSpecifier(ctx, afterImportIndex);
  if (!found) return false;
  if (!found.literal || found.literal.sawTemplateExpr) return true;

  const rewritten = rewriteSpecifier({ filePath, specifier: found.literal.value });
  if (rewritten) applyRewrite(ctx, found.quoteIndex, found.literal, rewritten);
  return true;
}

function tryHandleImport(ctx) {
  const { text } = ctx;
  if (!isKeywordAt(text, ctx.i, 'import')) return false;

  let j = ctx.i + 'import'.length;
  j = skipWs(text, j);

  // Dynamic import(...)
  if (handleDynamicImport(ctx, j)) {
    ctx.i += 1;
    return true;
  }

  // Side-effect import '...'
  if (handleSideEffectImport(ctx, j)) {
    ctx.i += 1;
    return true;
  }

  // Static import ... from '...'
  handleStaticImportFrom(ctx, j);

  ctx.i += 1;
  return true;
}

function tryHandleExport(ctx) {
  const { text, filePath } = ctx;
  if (!isKeywordAt(text, ctx.i, 'export')) return false;

  let j = ctx.i + 'export'.length;
  j = skipWs(text, j);

  const found = scanForFromSpecifier(ctx, j);
  if (found?.literal && !found.literal.sawTemplateExpr) {
    const rewritten = rewriteSpecifier({ filePath, specifier: found.literal.value });
    if (rewritten) applyRewrite(ctx, found.quoteIndex, found.literal, rewritten);
  }

  ctx.i += 1;
  return true;
}

function rewriteImportsInText({ filePath, text }) {
  /** @type {{ filePath: string, text: string, i: number, out: string, lastFlush: number, replacements: number, state: ReturnType<typeof createScanState> }} */
  const ctx = {
    filePath,
    text,
    i: 0,
    out: '',
    lastFlush: 0,
    replacements: 0,
    state: createScanState(),
  };

  while (ctx.i < text.length) {
    if (consumeStringOrComment(ctx)) continue;
    if (tryHandleImport(ctx)) continue;
    if (tryHandleExport(ctx)) continue;
    ctx.i += 1;
  }

  if (ctx.replacements === 0) return { text, replacements: 0 };

  ctx.out += text.slice(ctx.lastFlush);
  return { text: ctx.out, replacements: ctx.replacements };
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

  // Rewrite ESM relative import/export specifiers in a safe, linear-time way.
  const rewritten = rewriteImportsInText({ filePath: file, text: next });
  next = rewritten.text;
  replacements += rewritten.replacements;

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
