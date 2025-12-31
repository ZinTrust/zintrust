import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SRC_CONFIG_DIR = path.join(ROOT, 'src', 'config');
const DOCS_DIR = path.join(ROOT, 'docs');

function isDir(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function isFile(p) {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

function listTsFilesRecursive(dir) {
  /** @type {string[]} */
  const out = [];
  if (!isDir(dir)) return out;

  /** @type {string[]} */
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop();
    if (!current) continue;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
        continue;
      }
      if (entry.isFile() && full.endsWith('.ts')) out.push(full);
    }
  }

  out.sort();
  return out;
}

function toKebab(s) {
  return s
    .replaceAll(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replaceAll(/[_\s]+/g, '-')
    .replaceAll('.', '-')
    .toLowerCase();
}

function slugForConfigFile(absPath) {
  const relFromConfig = path.relative(SRC_CONFIG_DIR, absPath); // e.g. logging/HttpLogger.ts
  const noExt = relFromConfig.replace(/\.ts$/, '');
  const parts = noExt.split(path.sep).map((p) => toKebab(p));
  return `config-${parts.join('-')}`;
}

function takeLines(text, start1, count) {
  const lines = text.split(/\r?\n/);
  const startIndex = Math.max(0, start1 - 1);
  const endIndex = Math.min(lines.length, startIndex + count);
  return lines.slice(startIndex, endIndex).join('\n');
}

function tailLines(text, count) {
  const lines = text.split(/\r?\n/);
  return lines.slice(Math.max(0, lines.length - count)).join('\n');
}

function buildDoc({ absPath }) {
  const rel = path.relative(ROOT, absPath).replaceAll(path.sep, '/');
  const baseName = path.basename(absPath, '.ts');

  const content = fs.readFileSync(absPath, 'utf8');

  // Keep snapshots readable: first ~70 lines plus last ~60 lines.
  const head = takeLines(content, 1, 70);
  const tail = tailLines(content, 60);

  const title = `${baseName} config`;

  return `# ${title}\n\n- Source: \`${rel}\`\n\n## Usage\n\nImport from the framework:\n\n\`\`\`ts\nimport { ${baseName} } from '@zintrust/core';\n\n// Example (if supported by the module):\n// ${baseName}.*\n\`\`\`\n\n## Snapshot (top)\n\n\`\`\`ts\n${head}\n\`\`\`\n\n## Snapshot (bottom)\n\n\`\`\`ts\n${tail}\n\`\`\`\n`;
}

function main() {
  if (!isDir(SRC_CONFIG_DIR)) {
    throw new Error(`Missing src/config at ${SRC_CONFIG_DIR}`);
  }
  if (!isDir(DOCS_DIR)) {
    throw new Error(`Missing docs directory at ${DOCS_DIR}`);
  }

  const files = listTsFilesRecursive(SRC_CONFIG_DIR);

  /** @type {{ slug: string; rel: string }[]} */
  const generated = [];

  for (const absPath of files) {
    const slug = slugForConfigFile(absPath);
    const docPath = path.join(DOCS_DIR, `${slug}.md`);

    const doc = buildDoc({ absPath });
    fs.writeFileSync(docPath, doc);

    generated.push({ slug, rel: path.relative(SRC_CONFIG_DIR, absPath).replaceAll(path.sep, '/') });
  }

  // Write an index listing to help maintain sidebar entries.
  const indexPath = path.join(DOCS_DIR, 'config-reference.md');
  const lines = [
    '# Config Reference',
    '',
    'Auto-generated list of configuration modules from `src/config/`.',
    '',
    ...generated.map((g) => `- [${g.rel}](./${g.slug}.md)`),
    '',
  ];
  fs.writeFileSync(indexPath, lines.join('\n'));

  process.stdout.write(`✅ Generated ${generated.length} config docs + config-reference.md\n`);
}

main();
