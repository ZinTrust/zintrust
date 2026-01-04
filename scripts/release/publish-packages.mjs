import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

const repoRoot = process.cwd();
const packagesDir = path.join(repoRoot, 'packages');
const shimDir = path.join(repoRoot, 'tmp', 'release-core-shim');

const cliArgs = process.argv.slice(2);
const isDryRun = cliArgs.includes('--dry-run');

function getArgValue(flag) {
  const i = cliArgs.indexOf(flag);
  if (i === -1) return undefined;
  const v = cliArgs[i + 1];
  if (!v || v.startsWith('-')) return undefined;
  return v;
}

const npmTag = getArgValue('--tag');
const onlyDirsRaw = getArgValue('--only');
const onlyDirs = onlyDirsRaw
  ? new Set(
      onlyDirsRaw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    )
  : undefined;

function run(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, {
    stdio: 'inherit',
    shell: false,
    ...opts,
  });

  if (result.status !== 0) {
    throw new Error(`Command failed (${result.status}): ${cmd} ${args.join(' ')}`);
  }
}

async function createCoreShim() {
  await fs.mkdir(shimDir, { recursive: true });

  const pkgJson = {
    name: '@zintrust/core',
    version: '0.0.0',
    main: 'index.js',
    types: 'index.d.ts',
  };

  await fs.writeFile(path.join(shimDir, 'package.json'), JSON.stringify(pkgJson, null, 2));

  const dts = `
export declare const Logger: any;
export declare const ErrorFactory: any;
export declare const Env: any;
export declare const DatabaseAdapterRegistry: any;
export declare const CacheDriverRegistry: any;
export declare const MailDriverRegistry: any;
export declare const FeatureFlags: any;
export declare const QueryBuilder: any;
export declare const Cloudflare: any;
`;
  await fs.writeFile(path.join(shimDir, 'index.d.ts'), dts);

  const js = `
export const Logger = {};
export const ErrorFactory = {};
export const Env = {};
export const DatabaseAdapterRegistry = {};
export const CacheDriverRegistry = {};
export const MailDriverRegistry = {};
export const FeatureFlags = {};
export const QueryBuilder = {};
export const Cloudflare = {};
`;
  await fs.writeFile(path.join(shimDir, 'index.js'), js);
}

async function main() {
  const rootPkg = JSON.parse(await fs.readFile(path.join(repoRoot, 'package.json'), 'utf8'));
  const version = rootPkg.version;

  const entries = await fs.readdir(packagesDir, { withFileTypes: true });
  let packageDirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);

  if (onlyDirs && onlyDirs.size > 0) {
    packageDirs = packageDirs.filter((d) => onlyDirs.has(d));
  }

  // Publish in a stable order.
  packageDirs.sort();

  try {
    // Create shim for @zintrust/core so packages can resolve it during build
    await createCoreShim();

    for (const dirName of packageDirs) {
      const pkgDir = path.join(packagesDir, dirName);
      const pkgJsonPath = path.join(pkgDir, 'package.json');

      let pkg;
      try {
        pkg = JSON.parse(await fs.readFile(pkgJsonPath, 'utf8'));
      } catch {
        continue;
      }

      if (pkg.private === true) {
        process.stdout.write(`Skipping private package: ${pkg.name}\n`);
        continue;
      }

      process.stdout.write(
        `\n=== ${isDryRun ? 'Dry-run publishing' : 'Publishing'} ${pkg.name}@${pkg.version} (core ${version}) ===\n`
      );

      // Install the shim so tsc can find @zintrust/core
      run(
        'npm',
        ['install', '--no-save', '--no-package-lock', '--ignore-scripts', '--silent', shimDir],
        {
          cwd: pkgDir,
        }
      );

      // Ensure dist is up to date.
      run('npm', ['run', 'build'], { cwd: pkgDir });

      // Publish from the package directory.
      // NOTE: requires npm auth (npm login) and correct access setting.
      const publishArgs = ['publish', '--access', 'public'];
      if (npmTag) publishArgs.push('--tag', npmTag);
      if (isDryRun) publishArgs.push('--dry-run');

      run('npm', publishArgs, { cwd: pkgDir });
    }
  } finally {
    // Cleanup shim
    await fs.rm(shimDir, { recursive: true, force: true }).catch(() => {});
  }
}

await main();
