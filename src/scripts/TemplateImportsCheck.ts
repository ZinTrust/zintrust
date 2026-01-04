import * as fs from 'node:fs';
import * as path from 'node:path';

const TEMPLATES_ROOT = path.resolve(process.cwd(), 'src/templates');

const bannedPrefixes = [
  '@config/',
  '@exceptions/',
  '@orm/',
  '@routing/',
  '@middleware/',
  '@boot/',
  '@container/',
  '@http/',
  '@httpClient/',
  '@security/',
  '@validation/',
  '@profiling/',
  '@tools/',
  '@cache/',
  '@mail/',
  '@storage/',
  '@node-singletons/',
  '@app/',
  '@routes/',
  '@common/',
  '@/',
];

function listFilesRecursive(root: string): string[] {
  const out: string[] = [];
  const entries = fs.readdirSync(root, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      out.push(...listFilesRecursive(full));
    } else {
      out.push(full);
    }
  }
  return out;
}

function isTemplateFile(filePath: string): boolean {
  return filePath.endsWith('.tpl');
}

function checkFile(filePath: string): Array<{ line: number; spec: string; text: string }> {
  const text = fs.readFileSync(filePath, 'utf8');
  const lines = text.split(/\r?\n/);

  const offenses: Array<{ line: number; spec: string; text: string }> = [];

  const addIfBanned = (lineNo: number, spec: string, lineText: string): void => {
    const trimmed = spec.trim();
    if (trimmed === '@zintrust/core' || trimmed === '@zintrust/core/node') return;
    if (trimmed.startsWith('node:')) return;
    if (trimmed.startsWith('./') || trimmed.startsWith('../')) return;

    for (const prefix of bannedPrefixes) {
      if (trimmed.startsWith(prefix)) {
        offenses.push({ line: lineNo, spec: trimmed, text: lineText });
        return;
      }
    }
  };

  const importFromRe = /\bfrom\s+['"]([^'"]+)['"]/g;
  const dynamicImportRe = /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g;

  for (let i = 0; i < lines.length; i++) {
    const lineText = lines[i] ?? '';

    // from '...'
    for (const m of lineText.matchAll(importFromRe)) {
      const spec = m[1];
      if (typeof spec === 'string') addIfBanned(i + 1, spec, lineText);
    }

    // import('...')
    for (const m of lineText.matchAll(dynamicImportRe)) {
      const spec = m[1];
      if (typeof spec === 'string') addIfBanned(i + 1, spec, lineText);
    }
  }

  return offenses;
}

function main(): void {
  if (!fs.existsSync(TEMPLATES_ROOT)) {
    process.stderr.write(`Templates root not found: ${TEMPLATES_ROOT}\n`);
    process.exit(1);
  }

  const files = listFilesRecursive(TEMPLATES_ROOT).filter(isTemplateFile);
  const allOffenses: Array<{ file: string; line: number; spec: string; text: string }> = [];

  for (const file of files) {
    const offenses = checkFile(file);
    for (const o of offenses) {
      allOffenses.push({
        file: path.relative(process.cwd(), file),
        line: o.line,
        spec: o.spec,
        text: o.text,
      });
    }
  }

  if (allOffenses.length > 0) {
    process.stderr.write('Template import check failed. Disallowed import specifiers found:\n');
    for (const o of allOffenses) {
      process.stderr.write(`- ${o.file}:${o.line} -> ${o.spec}\n`);
      process.stderr.write(`  ${o.text.trim()}\n`);
    }
    process.stderr.write(
      "\nAllowed: '@zintrust/core', '@zintrust/core/node', 'node:*', and relative imports (./, ../).\n"
    );
    process.exit(1);
  }

  process.stdout.write(`✓ Template import check passed (${files.length} templates)\n`);
}

main();
