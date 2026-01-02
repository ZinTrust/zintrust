import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

const repoRoot = process.cwd();
const packagesDir = path.join(repoRoot, 'packages');

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

async function main() {
  const rootPkg = JSON.parse(await fs.readFile(path.join(repoRoot, 'package.json'), 'utf8'));
  const version = rootPkg.version;

  const entries = await fs.readdir(packagesDir, { withFileTypes: true });
  const packageDirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);

  // Publish in a stable order.
  packageDirs.sort();

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

    process.stdout.write(`\n=== Publishing ${pkg.name}@${pkg.version} (core ${version}) ===\n`);

    // Ensure dist is up to date.
    run('npm', ['--prefix', pkgDir, 'run', 'build']);

    // Publish from the package directory.
    // NOTE: requires npm auth (npm login) and correct access setting.
    run('npm', ['--prefix', pkgDir, 'publish', '--access', 'public']);
  }
}

await main();
