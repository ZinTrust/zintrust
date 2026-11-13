import { execSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { isPublishableFromNpmState } from './publishable-package-utils.mjs';

const repoRoot = process.cwd();
const packagesDir = path.join(repoRoot, 'packages');

const cliArgs = process.argv.slice(2);

function getArgValue(flag) {
  const i = cliArgs.indexOf(flag);
  if (i === -1) return undefined;
  const v = cliArgs[i + 1];
  if (v === undefined || v.startsWith('-')) return undefined;
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

function setGithubOutput(name, value) {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (!outputPath) {
    process.stdout.write(`${name}=${String(value)}\n`);
    return;
  }

  // Append to preserve any other outputs.
  return fs.appendFile(outputPath, `${name}=${String(value)}\n`, { encoding: 'utf8' });
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
    if (shouldConsiderChangedDirs() && !isDirChanged(dirName)) continue;

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

    if (isPublishableFromNpmState(dirName, pkg.version, publishedVersion, changedDirs)) {
      publishableDirs.push(dirName);
    }
  }

  await setGithubOutput('packages_should_publish', publishableDirs.length > 0 ? 'true' : 'false');
  await setGithubOutput('publishable_package_dirs', publishableDirs.join(','));
}

await main();
