/**
 * GovernanceScaffolder
 *
 * Adds optional governance tooling to a generated app:
 * - ESLint config + scripts
 * - Architecture tests (Vitest)
 */

import { FileGenerator } from '@cli/scaffolding/FileGenerator';
import { SpawnUtil } from '@cli/utils/spawn';
import { resolvePackageManager } from '@common/index';
import { Logger } from '@config/logger';
import { ErrorFactory } from '@exceptions/ZintrustError';
import * as path from '@node-singletons/path';

type PackageJson = {
  name?: unknown;
  version?: unknown;
  private?: unknown;
  type?: unknown;
  scripts?: Record<string, unknown>;
  dependencies?: Record<string, unknown>;
  devDependencies?: Record<string, unknown>;
};

export type GovernanceScaffoldOptions = Readonly<{
  writeEslintConfig?: boolean;
  writeArchTests?: boolean;
  install?: boolean;
  packageManager?: string;
}>;

export type GovernanceScaffoldResult = Readonly<{
  success: boolean;
  filesCreated: string[];
  message: string;
}>;

const getStringRecord = (value: unknown): Record<string, string> | undefined => {
  if (typeof value !== 'object' || value === null) return undefined;
  const obj = value as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'string') out[k] = v;
  }
  return out;
};

const readPackageJsonOrThrow = (projectRoot: string): PackageJson => {
  const pkgPath = path.join(projectRoot, 'package.json');
  if (!FileGenerator.fileExists(pkgPath)) {
    throw ErrorFactory.createValidationError(`package.json not found at ${pkgPath}`);
  }

  const raw = FileGenerator.readFile(pkgPath);
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== 'object' || parsed === null) {
    throw ErrorFactory.createValidationError('package.json is not a JSON object');
  }

  return parsed as PackageJson;
};

const writePackageJson = (projectRoot: string, pkg: PackageJson): void => {
  const pkgPath = path.join(projectRoot, 'package.json');
  const content = `${JSON.stringify(pkg, null, 2)}\n`;
  FileGenerator.writeFile(pkgPath, content, { overwrite: true });
};

const upsertScript = (scripts: Record<string, unknown>, name: string, value: string): void => {
  if (typeof scripts[name] !== 'string' || scripts[name] === '') {
    scripts[name] = value;
  }
};

const ensureDevDependency = (
  devDependencies: Record<string, unknown>,
  name: string,
  version: string
): void => {
  if (typeof devDependencies[name] !== 'string' || devDependencies[name] === '') {
    devDependencies[name] = version;
  }
};

const inferGovernanceVersion = (pkg: PackageJson): string => {
  const deps = getStringRecord(pkg.dependencies);
  const core = deps?.['@zintrust/core'];
  if (typeof core === 'string' && core.trim() !== '') return core;
  return '^0.1.0';
};

const writeEslintConfig = (projectRoot: string): string[] => {
  const eslintConfigPath = path.join(projectRoot, 'eslint.config.mjs');
  const content = `import { zintrustAppEslintConfig } from '@zintrust/governance';

export default zintrustAppEslintConfig({
  tsconfigRootDir: import.meta.dirname,
});
`;

  const wrote = FileGenerator.writeFile(eslintConfigPath, content, { overwrite: false });
  return wrote ? [eslintConfigPath] : [];
};

const IMPORT_BOUNDARIES_ARCH_TEST_CONTENT = `import * as fs from 'node:fs/promises';
import * as path from 'node:path';
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

const relFromRoot = (absPath: string): string => path.relative(repoRoot, absPath).replaceAll('\\\\', '/');

const startsWithAny = (value: string, prefixes: readonly string[]): boolean => {
  for (const p of prefixes) {
    if (value.startsWith(p)) return true;
  }
  return false;
};

const findViolations = async (
  files: string[],
  disallowedPrefixes: readonly string[],
  reasonPrefix: string
): Promise<Violation[]> => {
  const perFile = await Promise.all(
    files.map(async (file): Promise<Violation[]> => {
      const contents = await fs.readFile(file, 'utf-8');
      const imports = extractImportSpecifiers(contents, file);

      return imports
        .filter((hit) => startsWithAny(hit.specifier, disallowedPrefixes))
        .map((hit) => ({
          file: relFromRoot(file),
          reason: reasonPrefix + ' ' + hit.specifier,
          hit,
        }));
    })
  );

  return perFile.flat();
};

describe('Architecture: import boundaries', () => {
  it('prevents src/ from importing app/routes', async () => {
    const srcDir = path.join(repoRoot, 'src');
    const files = await walkTsFiles(srcDir);

    const violations = await findViolations(files, ['@app/', '@routes/'], 'src/ must not import');

    expect(violations).toEqual([]);
  });

  it('prevents app/ from importing routes', async () => {
    const appDir = path.join(repoRoot, 'app');
    const files = await walkTsFiles(appDir);

    const violations = await findViolations(files, ['@routes/'], 'app/ must not import');

    expect(violations).toEqual([]);
  });
});
`;

const ROUTE_MIDDLEWARE_REGISTRY_ARCH_TEST_CONTENT = `import { middlewareConfigObj } from '@config/middleware';
import { registerRoutes } from '@routes/api';
import { RouteRegistry, Router } from '@zintrust/core';
import { beforeEach, describe, expect, it } from 'vitest';

describe('Architecture: route middleware registry', () => {
  beforeEach(() => {
    RouteRegistry.clear();
  });

  it('ensures all route middleware names exist in middlewareConfigObj', () => {
    const router = Router.createRouter();
    registerRoutes(router);

    const allowed = new Set(Object.keys(middlewareConfigObj));
    const unknown: Array<{ method: string; path: string; middleware: string }> = [];

    for (const route of RouteRegistry.list()) {
      for (const name of route.middleware ?? []) {
        if (!allowed.has(name)) {
          unknown.push({ method: route.method, path: route.path, middleware: name });
        }
      }
    }

    expect(unknown).toEqual([]);
  });
});
`;

const writeArchTests = (projectRoot: string): string[] => {
  const files: Array<{ rel: string; content: string }> = [
    {
      rel: 'tests/unit/architecture/ImportBoundaries.arch.test.ts',
      content: IMPORT_BOUNDARIES_ARCH_TEST_CONTENT,
    },
    {
      rel: 'tests/unit/architecture/RouteMiddlewareRegistry.arch.test.ts',
      content: ROUTE_MIDDLEWARE_REGISTRY_ARCH_TEST_CONTENT,
    },
  ];

  const created: string[] = [];
  for (const file of files) {
    const abs = path.join(projectRoot, file.rel);
    const wrote = FileGenerator.writeFile(abs, file.content, {
      overwrite: false,
      createDirs: true,
    });
    if (wrote) created.push(abs);
  }

  return created;
};

const installGovernanceDeps = async (
  projectRoot: string,
  pm: string,
  packages: string[]
): Promise<void> => {
  if (packages.length === 0) return;

  let command = pm;
  let args: string[];

  switch (pm) {
    case 'pnpm':
      args = ['add', '-D', ...packages];
      break;
    case 'yarn':
      args = ['add', '--dev', ...packages];
      break;
    case 'npm':
    default:
      command = 'npm';
      args = ['install', '--save-dev', ...packages];
      break;
  }

  const exit = await SpawnUtil.spawnAndWait({ command, args, cwd: projectRoot });
  if (exit !== 0) {
    throw ErrorFactory.createCliError(`Failed to install governance dependencies (exit ${exit})`);
  }
};

export const GovernanceScaffolder = Object.freeze({
  async scaffold(
    projectRoot: string,
    options: GovernanceScaffoldOptions = {}
  ): Promise<GovernanceScaffoldResult> {
    try {
      const pkg = readPackageJsonOrThrow(projectRoot);

      const scripts = typeof pkg.scripts === 'object' && pkg.scripts !== null ? pkg.scripts : {};
      pkg.scripts = scripts;

      upsertScript(scripts, 'lint', 'eslint .');
      upsertScript(scripts, 'test:coverage', 'vitest run --coverage');
      upsertScript(
        scripts,
        'sonarqube',
        'node -e "console.log(\'SonarQube not configured for this project; skipping.\');"'
      );

      const devDeps =
        typeof pkg.devDependencies === 'object' && pkg.devDependencies !== null
          ? pkg.devDependencies
          : {};
      pkg.devDependencies = devDeps;

      const govVersion = inferGovernanceVersion(pkg);
      ensureDevDependency(devDeps, 'eslint', '^9.0.0');
      ensureDevDependency(devDeps, '@zintrust/governance', govVersion);

      writePackageJson(projectRoot, pkg);

      const filesCreated: string[] = [];
      if (options.writeEslintConfig !== false) {
        filesCreated.push(...writeEslintConfig(projectRoot));
      }
      if (options.writeArchTests !== false) {
        filesCreated.push(...writeArchTests(projectRoot));
      }

      if (options.install === true) {
        const pm =
          typeof options.packageManager === 'string' && options.packageManager.trim() !== ''
            ? options.packageManager.trim()
            : resolvePackageManager();

        Logger.info(`Installing governance devDependencies using ${pm}...`);
        await installGovernanceDeps(projectRoot, pm, [
          'eslint',
          `@zintrust/governance@${govVersion}`,
        ]);
      }

      return {
        success: true,
        filesCreated,
        message: 'Governance installed successfully',
      };
    } catch (error) {
      Logger.error('Governance scaffolding failed', error);
      const msg = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        filesCreated: [],
        message: msg,
      };
    }
  },
});

export default GovernanceScaffolder;
