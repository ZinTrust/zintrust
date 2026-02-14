import * as fs from '@node-singletons/fs';
import * as path from '@node-singletons/path';
import ts from 'typescript';

const TEMPLATES_ROOT = path.resolve(process.cwd(), 'src/templates');

const bannedPrefixes = [
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
  '@common/',
  '@/',
  './',
  '../',
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
    if (
      trimmed === '@zintrust/core' ||
      trimmed === '@zintrust/core/node' ||
      trimmed === '@zintrust/core/start'
    ) {
      return;
    }
    if (trimmed.startsWith('node:')) return;

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

function looksLikeTypeScriptTemplate(text: string): boolean {
  // Only attempt TS parsing when the template appears to contain TS module syntax.
  // Many templates are not TS (markdown/env/etc.) and should not be validated this way.
  return /\b(import|export)\b/.test(text);
}

function getTypeScriptSyntaxErrors(filePath: string): Array<{ line: number; message: string }> {
  const text = fs.readFileSync(filePath, 'utf8');
  if (!looksLikeTypeScriptTemplate(text)) return [];

  const sourceFile = ts.createSourceFile(
    filePath,
    text,
    ts.ScriptTarget.ESNext,
    true,
    ts.ScriptKind.TS
  );
  const diagnostics = (sourceFile as ts.SourceFile & { parseDiagnostics?: ts.Diagnostic[] })
    .parseDiagnostics;
  if (!diagnostics || diagnostics.length === 0) return [];

  const out: Array<{ line: number; message: string }> = [];
  for (const d of diagnostics) {
    const message = ts.flattenDiagnosticMessageText(d.messageText, '\n');
    const pos = typeof d.start === 'number' ? d.start : 0;
    const { line } = sourceFile.getLineAndCharacterOfPosition(pos);
    out.push({ line: line + 1, message });
  }
  return out;
}

function main(): void {
  if (!fs.existsSync(TEMPLATES_ROOT)) {
    process.stderr.write(`Templates root not found: ${TEMPLATES_ROOT}\n`);
    process.exit(1);
  }

  const files = listFilesRecursive(TEMPLATES_ROOT).filter(isTemplateFile);
  const allOffenses: Array<{ file: string; line: number; spec: string; text: string }> = [];
  const allSyntaxErrors: Array<{ file: string; line: number; message: string }> = [];

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

    const syntaxErrors = getTypeScriptSyntaxErrors(file);
    for (const e of syntaxErrors) {
      allSyntaxErrors.push({
        file: path.relative(process.cwd(), file),
        line: e.line,
        message: e.message,
      });
    }
  }

  if (allSyntaxErrors.length > 0) {
    process.stderr.write('Template syntax check failed. TypeScript parse errors found:\n');
    for (const e of allSyntaxErrors) {
      process.stderr.write(`- ${e.file}:${e.line} -> ${e.message}\n`);
    }
    process.exit(1);
  }

  if (allOffenses.length > 0) {
    process.stderr.write('Template import check failed. Disallowed import specifiers found:\n');
    for (const o of allOffenses) {
      process.stderr.write(`- ${o.file}:${o.line} -> ${o.spec}\n`);
      process.stderr.write(`  ${o.text.trim()}\n`);
    }
    process.stderr.write(
      "\nAllowed: '@zintrust/core', '@zintrust/core/node', '@zintrust/core/start', 'node:*'\n"
    );
    process.exit(1);
  }

  process.stdout.write(`✓ Template import check passed (${files.length} templates)\n`);
}

main();
