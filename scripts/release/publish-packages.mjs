import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

const repoRoot = process.cwd();
const packagesDir = path.join(repoRoot, 'packages');

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

    // Ensure dist is up to date.
    run('npm', ['run', 'build'], { cwd: pkgDir });

    // Publish from the package directory.
    // NOTE: requires npm auth (npm login) and correct access setting.
    const publishArgs = ['publish', '--access', 'public'];
    if (npmTag) publishArgs.push('--tag', npmTag);
    if (isDryRun) publishArgs.push('--dry-run');

    run('npm', publishArgs, { cwd: pkgDir });
  }
}

await main();
