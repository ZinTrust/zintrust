import fs from 'node:fs/promises';
import path from 'node:path';

const repoRoot = process.cwd();
const packagesDir = path.join(repoRoot, 'packages');

const cliArgs = process.argv.slice(2);
const isCheckOnly = cliArgs.includes('--check');

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

async function readJsonIfExists(filePath) {
  try {
    return await readJson(filePath);
  } catch (error) {
    if (isEnoent(error)) return undefined;
    throw error;
  }
}

function cloneValue(value) {
  return structuredClone(value);
}

function normalizePeerRange(version) {
  // Keep peers compatible with the current core major/minor.
  // If you prefer strict lockstep, change to just `${version}`.
  return `^${version}`;
}

function normalizeWorkspaceDependencyRange(version) {
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

    // Keep workspace packages in exact lockstep with the core version.
    if (typeof pkg.version === 'string' && pkg.version !== coreVersion) {
      pkg.version = coreVersion;
    }

    await writeJson(pkgPath, pkg);
    return pkg;
  } catch (error) {
    // Ignore folders without package.json.
    if (isEnoent(error)) return undefined;
    throw error;
  }
}

function replaceOrDeleteSection(target, key, source) {
  const value = source[key];
  if (typeof value === 'object' && value !== null) {
    target[key] = cloneValue(value);
    return true;
  }

  if (key in target) {
    delete target[key];
    return true;
  }

  return false;
}

function syncMirroredField(target, key, value) {
  const nextValue =
    typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value);
  const currentValue =
    typeof target[key] === 'object' && target[key] !== null
      ? JSON.stringify(target[key])
      : String(target[key]);

  if (nextValue === currentValue) {
    return false;
  }

  if (value === undefined) {
    delete target[key];
  } else if (typeof value === 'object' && value !== null) {
    target[key] = cloneValue(value);
  } else {
    target[key] = value;
  }

  return true;
}

function syncRootLockEntry(rootLock, rootPkg) {
  let didChange = false;

  if (rootLock.name !== rootPkg.name) {
    rootLock.name = rootPkg.name;
    didChange = true;
  }

  if (rootLock.version !== rootPkg.version) {
    rootLock.version = rootPkg.version;
    didChange = true;
  }

  rootLock.packages = rootLock.packages ?? {};
  const rootEntry = rootLock.packages[''] ?? (rootLock.packages[''] = {});

  const keysToMirror = ['name', 'version'];
  for (const key of keysToMirror) {
    if (syncMirroredField(rootEntry, key, rootPkg[key])) {
      didChange = true;
    }
  }

  for (const key of [
    'dependencies',
    'devDependencies',
    'optionalDependencies',
    'peerDependencies',
  ]) {
    if (replaceOrDeleteSection(rootEntry, key, rootPkg)) {
      didChange = true;
    }
  }

  return didChange;
}

function syncWorkspaceLockEntry(lockEntry, pkg, coreName) {
  let didChange = false;

  const keysToMirror = ['name', 'version'];

  for (const key of keysToMirror) {
    if (syncMirroredField(lockEntry, key, pkg[key])) {
      didChange = true;
    }
  }

  const expectedPeerRange = normalizePeerRange(pkg.version ?? '');
  if (
    typeof pkg.version === 'string' &&
    lockEntry.peerDependencies?.[coreName] !== expectedPeerRange
  ) {
    lockEntry.peerDependencies = lockEntry.peerDependencies ?? {};
    lockEntry.peerDependencies[coreName] = expectedPeerRange;
    didChange = true;
  }

  return didChange;
}

function syncPackageLock(rootLock, rootPkg, packageInfos, coreName) {
  let didChange = syncRootLockEntry(rootLock, rootPkg);

  rootLock.packages = rootLock.packages ?? {};

  // Force npm to treat all workspace packages as local links in node_modules
  // This prevents ETARGET errors during npm ci when unpublished versions are referenced.
  const allWorkspacePackageNames = [
    rootPkg.name,
    ...packageInfos.map((p) => p.name).filter(Boolean),
  ];
  for (const pkgName of allWorkspacePackageNames) {
    if (pkgName) {
      const nmKey = 'node_modules/' + pkgName;
      if (!rootLock.packages[nmKey]?.link) {
        rootLock.packages[nmKey] = { resolved: '', link: true };
        didChange = true;
      }
    }
  }

  for (const pkgInfo of packageInfos) {
    const lockKey = `packages/${pkgInfo.dirName}`;
    const lockEntry = rootLock.packages[lockKey] ?? (rootLock.packages[lockKey] = {});
    if (syncWorkspaceLockEntry(lockEntry, pkgInfo, coreName)) {
      didChange = true;
    }
  }

  return didChange;
}

function syncRootWorkspaceDependencies(rootPkg, packageInfos) {
  let didChange = false;
  const dependencySections = [
    'dependencies',
    'devDependencies',
    'optionalDependencies',
    'peerDependencies',
  ];

  for (const section of dependencySections) {
    const deps = rootPkg[section];
    if (typeof deps !== 'object' || deps === null) continue;

    for (const pkgInfo of packageInfos) {
      if (typeof pkgInfo.name !== 'string' || typeof pkgInfo.version !== 'string') continue;
      if (!(pkgInfo.name in deps)) continue;

      const expectedRange = normalizeWorkspaceDependencyRange(pkgInfo.version);
      if (deps[pkgInfo.name] !== expectedRange) {
        deps[pkgInfo.name] = expectedRange;
        didChange = true;
      }
    }
  }

  return didChange;
}

async function syncPackages(packageDirs, coreName, coreVersion) {
  const touched = [];
  const packageInfos = [];

  for (const dirName of packageDirs) {
    const pkgPath = path.join(packagesDir, dirName, 'package.json');
    const pkg = await syncPackageJson(pkgPath, coreName, coreVersion);

    if (pkg) {
      touched.push(path.relative(repoRoot, pkgPath));
      packageInfos.push({ dirName, ...pkg });
    }
  }

  const rootPkgPath = path.join(repoRoot, 'package.json');
  const rootPkg = await readJson(rootPkgPath);
  if (syncRootWorkspaceDependencies(rootPkg, packageInfos)) {
    await writeJson(rootPkgPath, rootPkg);
    touched.push(path.relative(repoRoot, rootPkgPath));
  }

  const rootLockPath = path.join(repoRoot, 'package-lock.json');
  const rootLock = await readJsonIfExists(rootLockPath);
  if (rootLock !== undefined && syncPackageLock(rootLock, rootPkg, packageInfos, coreName)) {
    await writeJson(rootLockPath, rootLock);
    touched.push(path.relative(repoRoot, rootLockPath));
  }

  return touched;
}

function formatIssue(issue) {
  return `- ${issue.file}: ${issue.message}`;
}

function pushIssue(issues, file, message) {
  issues.push({ file, message });
}

function collectRootLockIssues({ issues, repoRootPath, rootPkg, rootLock }) {
  const rootLockPath = path.join(repoRootPath, 'package-lock.json');
  const relRootLockPath = path.relative(repoRootPath, rootLockPath);

  if (rootLock === undefined) {
    pushIssue(issues, relRootLockPath, 'package-lock.json is missing');
    return;
  }

  if (rootLock.name !== rootPkg.name) {
    pushIssue(
      issues,
      relRootLockPath,
      `lockfile root name is ${JSON.stringify(rootLock.name)} but package.json has ${JSON.stringify(rootPkg.name)}`
    );
  }

  if (rootLock.version !== rootPkg.version) {
    pushIssue(
      issues,
      relRootLockPath,
      `lockfile root version is ${JSON.stringify(rootLock.version)} but package.json has ${JSON.stringify(rootPkg.version)}`
    );
  }

  const rootLockEntry = rootLock.packages?.[''];
  if (rootLockEntry?.version !== rootPkg.version) {
    pushIssue(
      issues,
      relRootLockPath,
      `lockfile packages[""] version is ${JSON.stringify(rootLockEntry?.version)} but package.json has ${JSON.stringify(rootPkg.version)}`
    );
  }
}

function collectPackageManifestIssues({
  issues,
  relPkgPath,
  pkg,
  coreName,
  coreVersion,
  expectedPeerRange,
}) {
  const pkgVersion = typeof pkg.version === 'string' ? pkg.version : undefined;
  const currentPeer = pkg.peerDependencies?.[coreName];

  if (pkgVersion === undefined) {
    pushIssue(issues, relPkgPath, 'package version is missing');
  } else if (compareVersions(coreVersion, pkgVersion) > 0) {
    pushIssue(
      issues,
      relPkgPath,
      `package version ${pkgVersion} is behind root core version ${coreVersion}`
    );
  }

  if (currentPeer !== expectedPeerRange) {
    pushIssue(
      issues,
      relPkgPath,
      `${coreName} peer range is ${JSON.stringify(currentPeer)} but expected ${JSON.stringify(expectedPeerRange)}`
    );
  }
}

function collectPackageLockIssues({
  issues,
  repoRootPath,
  rootLock,
  dirName,
  pkg,
  coreName,
  expectedPeerRange,
}) {
  const rootLockPath = path.join(repoRootPath, 'package-lock.json');
  const relRootLockPath = path.relative(repoRootPath, rootLockPath);
  const lockEntry = rootLock?.packages?.[`packages/${dirName}`];
  const pkgVersion = typeof pkg.version === 'string' ? pkg.version : undefined;

  if (!lockEntry) {
    pushIssue(issues, relRootLockPath, `missing lockfile workspace entry for packages/${dirName}`);
    return;
  }

  if (pkgVersion !== undefined && lockEntry.version !== pkgVersion) {
    pushIssue(
      issues,
      relRootLockPath,
      `packages/${dirName} version is ${JSON.stringify(lockEntry.version)} in lockfile but ${JSON.stringify(pkgVersion)} in package.json`
    );
  }

  const lockPeer = lockEntry.peerDependencies?.[coreName];
  if (lockPeer !== undefined && lockPeer !== expectedPeerRange) {
    pushIssue(
      issues,
      relRootLockPath,
      `packages/${dirName} ${coreName} peer range is ${JSON.stringify(lockPeer)} in lockfile but expected ${JSON.stringify(expectedPeerRange)}`
    );
  }
}

function collectRootWorkspaceDependencyIssues({ issues, rootPkg, packageInfos }) {
  const relRootPkgPath = 'package.json';
  const dependencySections = [
    'dependencies',
    'devDependencies',
    'optionalDependencies',
    'peerDependencies',
  ];

  for (const section of dependencySections) {
    const deps = rootPkg[section];
    if (typeof deps !== 'object' || deps === null) continue;

    for (const pkgInfo of packageInfos) {
      if (typeof pkgInfo.name !== 'string' || typeof pkgInfo.version !== 'string') continue;
      if (!(pkgInfo.name in deps)) continue;

      const expectedRange = normalizeWorkspaceDependencyRange(pkgInfo.version);
      if (deps[pkgInfo.name] !== expectedRange) {
        pushIssue(
          issues,
          relRootPkgPath,
          `${pkgInfo.name} ${section} range is ${JSON.stringify(deps[pkgInfo.name])} but expected ${JSON.stringify(expectedRange)}`
        );
      }
    }
  }
}

async function collectDriftIssues(packageDirs, coreName, coreVersion) {
  const issues = [];
  const expectedPeerRange = normalizePeerRange(coreVersion);
  const rootPkgPath = path.join(repoRoot, 'package.json');
  const rootLockPath = path.join(repoRoot, 'package-lock.json');
  const rootPkg = await readJson(rootPkgPath);
  const rootLock = await readJsonIfExists(rootLockPath);

  collectRootLockIssues({ issues, repoRootPath: repoRoot, rootPkg, rootLock });

  const packageInfos = [];

  for (const dirName of packageDirs) {
    const pkgPath = path.join(packagesDir, dirName, 'package.json');
    const pkg = await readJsonIfExists(pkgPath);
    if (!pkg) continue;

    packageInfos.push({ dirName, name: pkg.name, version: pkg.version });

    const relPkgPath = path.relative(repoRoot, pkgPath);
    collectPackageManifestIssues({
      issues,
      relPkgPath,
      pkg,
      coreName,
      coreVersion,
      expectedPeerRange,
    });
    collectPackageLockIssues({
      issues,
      repoRootPath: repoRoot,
      rootLock,
      dirName,
      pkg,
      coreName,
      expectedPeerRange,
    });
  }

  collectRootWorkspaceDependencyIssues({ issues, rootPkg, packageInfos });

  return issues;
}

async function main() {
  const { coreName, coreVersion } = await readRootPackageInfo();
  const packageDirs = await getPackageDirsList();

  if (isCheckOnly) {
    const issues = await collectDriftIssues(packageDirs, coreName, coreVersion);

    if (issues.length > 0) {
      process.stderr.write(
        `Workspace version sync check failed for ${coreName}@${coreVersion}\n` +
          issues.map(formatIssue).join('\n') +
          '\n\nRun:\n' +
          '- node scripts/release/sync-package-versions.mjs\n' +
          '- npm install --package-lock-only --ignore-scripts\n'
      );
      process.exit(1);
    }

    process.stdout.write(
      `Workspace version sync check passed for ${coreName}@${coreVersion} (${packageDirs.length} package(s))\n`
    );
    return;
  }

  const touched = await syncPackages(packageDirs, coreName, coreVersion);

  process.stdout.write(
    `Synced ${touched.length} package(s) to ${coreName}@${coreVersion} (peerDependencies + version when applicable)\n` +
      touched.map((p) => `- ${p}`).join('\n') +
      (touched.length ? '\n' : '')
  );
}

await main();
