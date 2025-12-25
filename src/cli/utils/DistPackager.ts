import { Logger } from '@config/logger';
import { ErrorFactory } from '@exceptions/ZintrustError';
import fs from '@node-singletons/fs';
import * as path from '@node-singletons/path';

type RootPackageJson = {
  name?: unknown;
  version?: unknown;
  dependencies?: unknown;
};

type DistPackageJson = {
  name: string;
  version: string;
  private: boolean;
  type: 'module';
  main: './index.js';
  types: './index.d.ts';
  bin: Record<string, string>;
  exports: {
    '.': {
      types: './index.d.ts';
      default: './index.js';
    };
  };
  dependencies: Record<string, unknown>;
};

const readRootPackageJson = (rootPath: string): RootPackageJson => {
  const rootPackageJsonPath = path.join(rootPath, 'package.json');
  if (!fs.existsSync(rootPackageJsonPath)) {
    throw ErrorFactory.createConfigError(`Missing package.json at: ${rootPackageJsonPath}`);
  }

  try {
    const raw = fs.readFileSync(rootPackageJsonPath, 'utf8');
    return JSON.parse(raw) as RootPackageJson;
  } catch (error) {
    throw ErrorFactory.createTryCatchError('Failed to read root package.json', error);
  }
};

const coerceDependencies = (value: unknown): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null) return {};
  return value as Record<string, unknown>;
};

const buildDistPackageJson = (rootPkg: RootPackageJson): DistPackageJson => {
  const name =
    typeof rootPkg.name === 'string' && rootPkg.name.trim() !== '' ? rootPkg.name : 'zintrust';
  const version =
    typeof rootPkg.version === 'string' && rootPkg.version.trim() !== ''
      ? rootPkg.version
      : '0.0.0';

  return {
    name,
    version,
    private: true,
    type: 'module',
    main: './index.js',
    types: './index.d.ts',
    bin: {
      zintrust: './bin/zintrust.js',
      zin: './bin/zin.js',
      z: './bin/z.js',
      zt: './bin/zt.js',
    },
    exports: {
      '.': {
        types: './index.d.ts',
        default: './index.js',
      },
    },
    dependencies: coerceDependencies(rootPkg.dependencies),
  };
};

const writeDistEntrypoints = (distPath: string): void => {
  const distIndexJsPath = path.join(distPath, 'index.js');
  const distIndexDtsPath = path.join(distPath, 'index.d.ts');

  fs.writeFileSync(distIndexJsPath, "export * from './src/index.js';\n");
  fs.writeFileSync(distIndexDtsPath, "export * from './src/index';\n");
};

const writeDistPackageJson = (distPath: string, pkg: DistPackageJson): void => {
  const distPackageJsonPath = path.join(distPath, 'package.json');
  fs.writeFileSync(distPackageJsonPath, JSON.stringify(pkg, null, 2) + '\n');
};

const warnIfMissingDistArtifacts = (distPath: string): void => {
  const expected = [
    path.join(distPath, 'src', 'index.js'),
    path.join(distPath, 'bin', 'zintrust.js'),
    path.join(distPath, 'bin', 'zin.js'),
  ];

  for (const candidate of expected) {
    if (!fs.existsSync(candidate)) {
      Logger.warn(`Dist artifact missing (did you run build?): ${candidate}`);
    }
  }

  const docsRoot = path.join(distPath, 'public');
  if (!fs.existsSync(docsRoot)) {
    Logger.warn(`Docs public root missing at ${docsRoot} (expected dist/public)`);
  }
};

export const DistPackager = Object.freeze({
  /**
   * Creates minimal metadata so `dist/` can be installed via `file:/.../dist`.
   * This is intended for local dev/simulate apps, not publishing.
   */
  prepare(distPath: string, rootPath: string = process.cwd()): void {
    if (!fs.existsSync(distPath)) {
      throw ErrorFactory.createConfigError(
        `Missing dist output at: ${distPath}. Run 'npm run build' first.`
      );
    }

    const rootPkg = readRootPackageJson(rootPath);
    const distPkg = buildDistPackageJson(rootPkg);

    writeDistPackageJson(distPath, distPkg);
    writeDistEntrypoints(distPath);
    warnIfMissingDistArtifacts(distPath);

    Logger.info(`✅ Prepared dist package metadata at: ${path.join(distPath, 'package.json')}`);
  },
});
