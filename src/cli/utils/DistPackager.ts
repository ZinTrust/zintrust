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
  type: 'module';
  main: './index.js';
  types: './index.d.ts';
  bin: Record<string, string>;
  exports: Record<
    string,
    | {
        types: string;
        default: string;
      }
    | string
  >;
  dependencies: Record<string, unknown>;
  publishConfig: {
    access: 'public';
  };
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
    typeof rootPkg.name === 'string' && rootPkg.name.trim() !== ''
      ? rootPkg.name
      : '@zintrust/core';
  const version =
    typeof rootPkg.version === 'string' && rootPkg.version.trim() !== ''
      ? rootPkg.version
      : '0.0.0';

  return {
    name,
    version,
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
      './start': {
        types: './start.d.ts',
        default: './start.js',
      },
      './cli': {
        types: './src/cli.d.ts',
        default: './src/cli.js',
      },
      './proxy': {
        types: './src/proxy.d.ts',
        default: './src/proxy.js',
      },
      './proxy/*': {
        types: './src/proxy/*.d.ts',
        default: './src/proxy/*.js',
      },
      './collections': {
        types: './src/collections/index.d.ts',
        default: './src/collections/index.js',
      },
      './helper': {
        types: './src/helper/index.d.ts',
        default: './src/helper/index.js',
      },
      './node': {
        types: './src/node.d.ts',
        default: './src/node.js',
      },
      './routes/*': {
        types: './routes/*.d.ts',
        default: './routes/*.js',
      },
      './package.json': './package.json',
    },
    dependencies: coerceDependencies(rootPkg.dependencies),
    publishConfig: {
      access: 'public',
    },
  };
};

const writeDistEntrypoints = (distPath: string): void => {
  const entrypoints = [
    ['index.js', "export * from './src/index.js';\n"],
    ['index.d.ts', "export * from './src/index';\n"],
    ['start.js', "export * from './src/start.js'; export { default } from './src/start.js';\n"],
    ['start.d.ts', "export * from './src/start'; export { default } from './src/start';\n"],
  ] as const;

  for (const [relativePath, content] of entrypoints) {
    fs.writeFileSync(path.join(distPath, relativePath), content);
  }
};

const writeDistPackageJson = (distPath: string, pkg: DistPackageJson): void => {
  const distPackageJsonPath = path.join(distPath, 'package.json');
  fs.writeFileSync(distPackageJsonPath, JSON.stringify(pkg, null, 2) + '\n');
};

const warnIfMissingDistArtifacts = (distPath: string): void => {
  const expected = [
    ['src/index.js', 'Dist artifact missing (did you run build?)'],
    ['bin/zintrust.js', 'Dist artifact missing (did you run build?)'],
    ['bin/zin.js', 'Dist artifact missing (did you run build?)'],
    ['public', 'Docs public root missing'],
  ] as const;

  for (const [relativePath, message] of expected) {
    const candidate = path.join(distPath, ...relativePath.split('/'));
    if (fs.existsSync(candidate)) {
      continue;
    }

    if (relativePath === 'public') {
      Logger.warn(`${message} at ${candidate} (expected dist/public)`);
      continue;
    }

    Logger.warn(`${message}: ${candidate}`);
  }
};

export const DistPackager = Object.freeze({
  /**
   * Creates minimal metadata so `dist/` can be installed via `file:/.../dist`
   * without clobbering the publishable package manifest.
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
