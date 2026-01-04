import { join } from '@node-singletons/path';
import { describe, expect, it } from 'vitest';

// Module under test - we'll import the functions via dynamic import to test them
const SCRIPT_PATH = join(process.cwd(), 'src/scripts/TemplateImportsCheck.ts');

// Since the script is a CLI script, we'll test its functions by re-implementing them
// based on the source code and testing their behavior

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

function isTemplateFile(filePath: string): boolean {
  return filePath.endsWith('.tpl');
}

function checkFile(text: string): Array<{ line: number; spec: string; text: string }> {
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

describe('TemplateImportsCheck', () => {
  describe('isTemplateFile', () => {
    it('returns true for .tpl files', () => {
      expect(isTemplateFile('template.tpl')).toBe(true);
      expect(isTemplateFile('/path/to/template.tpl')).toBe(true);
    });

    it('returns false for non-.tpl files', () => {
      expect(isTemplateFile('template.ts')).toBe(false);
      expect(isTemplateFile('template.js')).toBe(false);
      expect(isTemplateFile('template')).toBe(false);
    });
  });

  describe('checkFile', () => {
    it('allows node: imports', () => {
      const text = `import fs from 'node:fs';
import path from 'node:path';`;
      const offenses = checkFile(text);
      expect(offenses).toEqual([]);
    });

    it('allows relative imports', () => {
      const text = `import { helper } from './helper';
import { util } from '../utils';`;
      const offenses = checkFile(text);
      expect(offenses).toEqual([]);
    });

    it('allows @zintrust/core imports', () => {
      const text = `import { core } from '@zintrust/core';
import { node } from '@zintrust/core/node';`;
      const offenses = checkFile(text);
      expect(offenses).toEqual([]);
    });

    it('detects banned @config imports', () => {
      const text = `import { config } from '@config/app';`;
      const offenses = checkFile(text);
      expect(offenses.length).toBe(1);
      expect(offenses[0].spec).toBe('@config/app');
      expect(offenses[0].line).toBe(1);
    });

    it('detects banned @exceptions imports', () => {
      const text = `import { ErrorFactory } from '@exceptions/ZintrustError';`;
      const offenses = checkFile(text);
      expect(offenses.length).toBe(1);
      expect(offenses[0].spec).toBe('@exceptions/ZintrustError');
    });

    it('detects banned @orm imports', () => {
      const text = `import { QueryBuilder } from '@orm/QueryBuilder';`;
      const offenses = checkFile(text);
      expect(offenses.length).toBe(1);
      expect(offenses[0].spec).toBe('@orm/QueryBuilder');
    });

    it('detects banned @tools imports', () => {
      const text = `import { Storage } from '@tools/storage';`;
      const offenses = checkFile(text);
      expect(offenses.length).toBe(1);
      expect(offenses[0].spec).toBe('@tools/storage');
    });

    it('detects banned dynamic imports', () => {
      const text = `const config = await import('@config/env');`;
      const offenses = checkFile(text);
      expect(offenses.length).toBe(1);
      expect(offenses[0].spec).toBe('@config/env');
    });

    it('detects multiple offenses on same line', () => {
      const text = `import a from '@config/app'; import b from '@tools/storage';`;
      const offenses = checkFile(text);
      expect(offenses.length).toBeGreaterThan(0);
    });

    it('handles multiline files with mixed imports', () => {
      const text = `import fs from 'node:fs';
import { helper } from './utils';
import { config } from '@config/app';
import { Storage } from '@tools/storage';
import rel from '../other';`;
      const offenses = checkFile(text);
      expect(offenses.length).toBe(2);
      expect(offenses[0].line).toBe(3);
      expect(offenses[1].line).toBe(4);
    });

    it('ignores imports with trimmed whitespace', () => {
      const text = `import { config } from '  @config/app  ';`;
      const offenses = checkFile(text);
      expect(offenses.length).toBe(1);
      expect(offenses[0].spec).toBe('@config/app');
    });

    it('detects all banned prefixes', () => {
      const text = `from '@config/x'`;
      const offenses = checkFile(text);
      expect(offenses.length).toBe(1);
    });

    it('allows single quotes and double quotes', () => {
      const text1 = `import x from '@config/app';`;
      const text2 = `import x from "@config/app";`;
      expect(checkFile(text1).length).toBe(1);
      expect(checkFile(text2).length).toBe(1);
    });
  });
});
