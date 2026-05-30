import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootPackagePath = path.join(__dirname, '../package.json');
const rootPackage = JSON.parse(fs.readFileSync(rootPackagePath, 'utf-8'));
const npmVersionCache = new Map();

function getWorkspacePackageVersions() {
  const workspaceVersions = new Map();
  const packagesDir = path.join(__dirname, '../packages');

  for (const entry of fs.readdirSync(packagesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;

    const packageJsonPath = path.join(packagesDir, entry.name, 'package.json');
    if (!fs.existsSync(packageJsonPath)) continue;

    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    if (typeof packageJson.name !== 'string' || typeof packageJson.version !== 'string') continue;

    workspaceVersions.set(packageJson.name, packageJson.version);
  }

  return workspaceVersions;
}

function getPublishedWorkspacePackageVersions(workspaceVersions) {
  const publishedWorkspaceVersions = new Map();

  for (const [packageName, fallbackVersion] of workspaceVersions.entries()) {
    publishedWorkspaceVersions.set(
      packageName,
      getLatestNpmVersion(packageName) ?? fallbackVersion
    );
  }

  return publishedWorkspaceVersions;
}

function pinWorkspaceDependencyVersions(dependencies, workspaceVersions) {
  if (typeof dependencies !== 'object' || dependencies === null) {
    return dependencies;
  }

  const pinnedDependencies = { ...dependencies };

  for (const [packageName, version] of workspaceVersions.entries()) {
    if (packageName in pinnedDependencies) {
      pinnedDependencies[packageName] = version;
    }
  }

  return pinnedDependencies;
}

/**
 * Simple semver patch incrementer
 */
function incrementPatch(version) {
  const parts = version.split('.');
  if (parts.length !== 3) return version;
  return `${parts[0]}.${parts[1]}.${Number.parseInt(parts[2], 10) + 1}`;
}

/**
 * Simple semver comparison (v1 > v2)
 */
function isGreater(v1, v2) {
  const p1 = v1.split('.').map(Number);
  const p2 = v2.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if (p1[i] > p2[i]) return true;
    if (p1[i] < p2[i]) return false;
  }
  return false;
}

/**
 * Get latest version from npm registry
 */
function getLatestNpmVersion(packageName) {
  if (npmVersionCache.has(packageName)) {
    return npmVersionCache.get(packageName);
  }

  try {
    const cmd = `npm view ${packageName} version`;
    const version = execSync(cmd, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim(); // NOSONAR
    npmVersionCache.set(packageName, version);
    return version;
  } catch {
    npmVersionCache.set(packageName, null);
    return null;
  }
}

// 1. Determine dist version from the checked-in repo version only.
const isCi = process.env.CI === 'true' || process.env.CI === '1';
const skipNpmVersionCheck = process.env.DIST_SKIP_NPM_VERSION_CHECK === 'true';
const workspacePackageVersions = skipNpmVersionCheck
  ? getWorkspacePackageVersions()
  : getPublishedWorkspacePackageVersions(getWorkspacePackageVersions());

const finalVersion = rootPackage.version;

console.log(`📦 Repo version:   ${rootPackage.version}`);
console.log(`🚀 Dist version:   ${finalVersion}`);

// 2. Prepare dist package.json
const distPackage = {
  name: rootPackage.name,
  version: finalVersion,
  description: rootPackage.description,
  homepage: rootPackage.homepage,
  repository: rootPackage.repository,
  bugs: rootPackage.bugs,
  type: 'module',
  main: 'src/index.js',
  types: 'src/index.d.ts',
  exports: Object.fromEntries(
    Object.entries(rootPackage.exports).map(([key, value]) => {
      if (typeof value === 'string') {
        return [key, value.replace('./dist/', './')];
      }
      if (typeof value === 'object' && value !== null) {
        const transformed = {};
        for (const [subKey, subValue] of Object.entries(value)) {
          transformed[subKey] =
            typeof subValue === 'string' ? subValue.replace('./dist/', './') : subValue;
        }
        return [key, transformed];
      }
      return [key, value];
    })
  ),
  dependencies: pinWorkspaceDependencyVersions(rootPackage.dependencies, workspacePackageVersions),
  overrides: rootPackage.overrides,
  bin: {
    zintrust: 'bin/zintrust.js',
    zin: 'bin/zin.js',
    z: 'bin/z.js',
    zt: 'bin/zt.js',
  },
  files: ['bin', 'src', 'public'],
  engines: rootPackage.engines,
  keywords: rootPackage.keywords,
  author: rootPackage.author,
  license: rootPackage.license,
  publishConfig: {
    access: 'public',
  },
};

fs.writeFileSync(
  path.join(__dirname, '../dist/package.json'),
  JSON.stringify(distPackage, null, 2) + '\n'
);

console.log('✅ dist/package.json generated');
