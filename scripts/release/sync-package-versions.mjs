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

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

async function writeJson(filePath, data) {
  const raw = `${JSON.stringify(data, null, 2)}\n`;
  await fs.writeFile(filePath, raw, 'utf8');
}

function normalizePeerRange(version) {
  // Keep peers compatible with the current core major/minor.
  // If you prefer strict lockstep, change to just `${version}`.
  return `^${version}`;
}

function compareVersions(a, b) {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);

  for (let i = 0; i < 3; i++) {
    const av = pa[i] ?? 0;
    const bv = pb[i] ?? 0;
    if (av > bv) return 1;
    if (av < bv) return -1;
  }

  return 0;
}

function isEnoent(error) {
  return error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT';
}

async function readRootPackageInfo() {
  const rootPkgPath = path.join(repoRoot, 'package.json');
  const rootPkg = await readJson(rootPkgPath);

  const coreName = rootPkg.name;
  const coreVersion = rootPkg.version;

  if (typeof coreName !== 'string' || coreName.length === 0) {
    throw new Error('Root package.json is missing a valid "name"');
  }
  if (typeof coreVersion !== 'string' || coreVersion.length === 0) {
    throw new Error('Root package.json is missing a valid "version"');
  }

  return { coreName, coreVersion };
}

async function getPackageDirsList() {
  const entries = await fs.readdir(packagesDir, { withFileTypes: true });
  let packageDirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);

  if (onlyDirs && onlyDirs.size > 0) {
    packageDirs = packageDirs.filter((d) => onlyDirs.has(d));
  }

  return packageDirs;
}

async function syncPackageJson(pkgPath, coreName, coreVersion) {
  try {
    const pkg = await readJson(pkgPath);

    pkg.peerDependencies = pkg.peerDependencies ?? {};
    if (typeof pkg.peerDependencies !== 'object' || pkg.peerDependencies === null) {
      pkg.peerDependencies = {};
    }

    // Keep adapter packages tracking the core version.
    pkg.peerDependencies[coreName] = normalizePeerRange(coreVersion);

    // Prefer lockstep versions when core is ahead. Never downgrade.
    if (typeof pkg.version === 'string' && compareVersions(coreVersion, pkg.version) > 0) {
      pkg.version = coreVersion;
    }

    await writeJson(pkgPath, pkg);
    return true;
  } catch (error) {
    // Ignore folders without package.json.
    if (isEnoent(error)) return false;
    throw error;
  }
}

async function syncPackages(packageDirs, coreName, coreVersion) {
  const touched = [];

  for (const dirName of packageDirs) {
    const pkgPath = path.join(packagesDir, dirName, 'package.json');
    const didSync = await syncPackageJson(pkgPath, coreName, coreVersion);

    if (didSync) {
      touched.push(path.relative(repoRoot, pkgPath));
    }
  }

  return touched;
}

async function main() {
  const { coreName, coreVersion } = await readRootPackageInfo();
  const packageDirs = await getPackageDirsList();
  const touched = await syncPackages(packageDirs, coreName, coreVersion);

  process.stdout.write(
    `Synced ${touched.length} package(s) to ${coreName}@${coreVersion} (peerDependencies + version when applicable)\n` +
      touched.map((p) => `- ${p}`).join('\n') +
      (touched.length ? '\n' : '')
  );
}

await main();
