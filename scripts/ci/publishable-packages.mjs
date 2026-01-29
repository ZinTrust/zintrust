import { execSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

const repoRoot = process.cwd();
const packagesDir = path.join(repoRoot, 'packages');

const cliArgs = process.argv.slice(2);

function getArgValue(flag) {
  const i = cliArgs.indexOf(flag);
  if (i === -1) return undefined;
  const v = cliArgs[i + 1];
  if (!v || v.startsWith('-')) return undefined;
  return v;
}

const onlyDirsRaw = getArgValue('--only');
const onlyDirs = onlyDirsRaw
  ? new Set(
      onlyDirsRaw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    )
  : undefined;

const changedDirsRaw = getArgValue('--changed');
const changedDirs =
  changedDirsRaw === undefined
    ? undefined
    : new Set(
        changedDirsRaw
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      );

function isDirSelected(dirName) {
  if (!onlyDirs || onlyDirs.size === 0) return true;
  return onlyDirs.has(dirName);
}

function shouldConsiderChangedDirs() {
  return changedDirs !== undefined;
}

function isDirChanged(dirName) {
  if (!changedDirs) return false;
  return changedDirs.has(dirName);
}

function isPublishableFromNpmState(dirName, localVersion, publishedVersion) {
  // Always allow first-time publishes, even if no files changed.
  if (publishedVersion === null) return true;

  // If change info is provided, do not republish unchanged packages.
  if (shouldConsiderChangedDirs() && !isDirChanged(dirName)) return false;

  return compareVersions(localVersion, publishedVersion) > 0;
}

function setGithubOutput(name, value) {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (!outputPath) {
    process.stdout.write(`${name}=${String(value)}\n`);
    return;
  }

  // Append to preserve any other outputs.
  return fs.appendFile(outputPath, `${name}=${String(value)}\n`, { encoding: 'utf8' });
}

function compareVersions(a, b) {
  if (!b) return 1;
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return 1;
    if ((pa[i] || 0) < (pb[i] || 0)) return -1;
  }
  return 0;
}

function npmViewVersion(pkgName) {
  try {
    const npmS = `npm view ${pkgName} version --json --loglevel=silent`;
    const out = execSync(npmS, {
      encoding: 'utf8',
    }).trim();
    try {
      return JSON.parse(out);
    } catch {
      return out;
    }
  } catch (err) {
    const message = String(err?.message ?? err);
    const stdout = typeof err?.stdout === 'string' ? err.stdout : '';
    const stderr = typeof err?.stderr === 'string' ? err.stderr : '';

    const combined = `${message}\n${stdout}\n${stderr}`;

    // Unpublished package (or no access): treat as not published.
    if (
      combined.includes('E404') ||
      combined.includes('404 Not Found') ||
      combined.includes('code": "E404"')
    ) {
      return null;
    }

    throw err;
  }
}

async function main() {
  const entries = await fs.readdir(packagesDir, { withFileTypes: true });
  const packageDirs = entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .filter((element) => isDirSelected(element))
    .sort();

  const publishableDirs = [];

  for (const dirName of packageDirs) {
    const pkgDir = path.join(packagesDir, dirName);
    const pkgJsonPath = path.join(pkgDir, 'package.json');

    let pkg;
    try {
      pkg = JSON.parse(await fs.readFile(pkgJsonPath, 'utf8'));
    } catch {
      continue;
    }

    if (!pkg?.name || !pkg?.version) continue;
    if (pkg.private === true) continue;

    const publishedVersion = npmViewVersion(pkg.name);

    if (isPublishableFromNpmState(dirName, pkg.version, publishedVersion)) {
      publishableDirs.push(dirName);
    }
  }

  await setGithubOutput('packages_should_publish', publishableDirs.length > 0 ? 'true' : 'false');
  await setGithubOutput('publishable_package_dirs', publishableDirs.join(','));
}

await main();
