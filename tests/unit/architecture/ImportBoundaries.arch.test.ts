import { fsPromises as fs } from '@node-singletons/fs';
import * as path from '@node-singletons/path';
import * as ts from 'typescript';
import { describe, expect, it } from 'vitest';

type ImportHit = {
  specifier: string;
  line: string;
};

type Violation = {
  file: string;
  reason: string;
  hit: ImportHit;
};

const repoRoot = process.cwd();

const isTsFile = (filePath: string): boolean => {
  if (!filePath.endsWith('.ts')) return false;
  if (filePath.endsWith('.d.ts')) return false;
  return true;
};

const walkTsFiles = async (dir: string): Promise<string[]> => {
  const entries = await fs.readdir(dir, { withFileTypes: true });

  const files = entries
    .filter((ent) => ent.isFile())
    .map((ent) => path.join(dir, ent.name))
    .filter(isTsFile);

  const subDirs = entries.filter((ent) => ent.isDirectory()).map((ent) => path.join(dir, ent.name));
  const nested = await Promise.all(subDirs.map((subDir) => walkTsFiles(subDir)));

  return [...files, ...nested.flat()];
};

const extractImportSpecifiers = (source: string, filePath: string): ImportHit[] => {
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.ESNext,
    true,
    ts.ScriptKind.TS
  );
  const lines = source.split(/\r?\n/);
  const hits: ImportHit[] = [];

  const addHit = (specifier: string, pos: number) => {
    const { line } = sourceFile.getLineAndCharacterOfPosition(pos);
    hits.push({
      specifier,
      line: (lines[line] ?? '').trim(),
    });
  };

  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      const moduleSpecifier = node.moduleSpecifier;
      if (moduleSpecifier && ts.isStringLiteral(moduleSpecifier)) {
        addHit(moduleSpecifier.text, moduleSpecifier.getStart(sourceFile));
      }
    }

    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const arg = node.arguments.at(0);
      if (arg && ts.isStringLiteral(arg)) {
        addHit(arg.text, arg.getStart(sourceFile));
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return hits.filter((h) => h.specifier.trim() !== '');
};

const relFromRoot = (absPath: string): string =>
  path.relative(repoRoot, absPath).replaceAll('\\', '/');

const isWithin = (absPath: string, relDir: string): boolean => {
  const rel = relFromRoot(absPath);
  return rel === relDir || rel.startsWith(`${relDir}/`);
};

const startsWithAny = (value: string, prefixes: readonly string[]): boolean => {
  for (const p of prefixes) {
    if (value.startsWith(p)) return true;
  }
  return false;
};

const findViolations = async (
  files: string[],
  disallowedPrefixes: readonly string[],
  reasonPrefix: string,
  opts?: {
    ignoreIf?: (absPath: string) => boolean;
  }
): Promise<Violation[]> => {
  const perFile = await Promise.all(
    files.map(async (file): Promise<Violation[]> => {
      if (opts?.ignoreIf?.(file)) return [];
      const contents = await fs.readFile(file, 'utf-8');
      const imports = extractImportSpecifiers(contents, file);

      return imports
        .filter((hit) => startsWithAny(hit.specifier, disallowedPrefixes))
        .map((hit) => ({
          file: relFromRoot(file),
          reason: `${reasonPrefix} ${hit.specifier}`,
          hit,
        }));
    })
  );

  return perFile.flat();
};

describe('Architecture: import boundaries', () => {
  it('prevents core src/ from importing app/routes/bin', async () => {
    const srcDir = path.join(repoRoot, 'src');
    const files = await walkTsFiles(srcDir);

    const violations = await findViolations(
      files,
      ['@app/', '@routes/', '@bin/'],
      'src/ must not import',
      {
        // src/cli and src/routes are allowed to bridge to generated app + route entrypoints.
        ignoreIf: (file) => isWithin(file, 'src/cli') || isWithin(file, 'src/routes'),
      }
    );

    expect(violations).toEqual([]);
  });

  it('prevents app/ from importing routes/bin', async () => {
    const appDir = path.join(repoRoot, 'app');
    const files = await walkTsFiles(appDir);

    const violations = await findViolations(files, ['@routes/', '@bin/'], 'app/ must not import');

    expect(violations).toEqual([]);
  });

  it('prevents routes/ from importing bin', async () => {
    const routesDir = path.join(repoRoot, 'routes');
    const files = await walkTsFiles(routesDir);

    const violations = await findViolations(files, ['@bin/'], 'routes/ must not import');

    expect(violations).toEqual([]);
  });
});
