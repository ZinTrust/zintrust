import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootPackagePath = path.join(__dirname, '../package.json');
const rootPackage = JSON.parse(fs.readFileSync(rootPackagePath, 'utf-8'));

/**
 * Simple semver patch incrementer
 */
function incrementPatch(version) {
  const parts = version.split('.');
  if (parts.length !== 3) return version;
  return `${parts[0]}.${parts[1]}.${parseInt(parts[2], 10) + 1}`;
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
  try {
    return execSync(`npm view ${packageName} version`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch (error) {
    return null;
  }
}

// 1. Determine next version
const latestPublished = getLatestNpmVersion(rootPackage.name);
let finalVersion = rootPackage.version;

if (latestPublished) {
  const nextPatch = incrementPatch(latestPublished);
  // Use the higher of (npm + 1) or (local version)
  if (isGreater(nextPatch, finalVersion)) {
    finalVersion = nextPatch;
  }
}

console.log(`📦 Local version:  ${rootPackage.version}`);
console.log(`🌐 NPM version:    ${latestPublished || 'not published'}`);
console.log(`🚀 Final version:  ${finalVersion}`);

// 2. Update root package.json if version changed
if (finalVersion !== rootPackage.version) {
  rootPackage.version = finalVersion;
  fs.writeFileSync(rootPackagePath, JSON.stringify(rootPackage, null, 2) + '\n');
  console.log('✅ Root package.json updated');
}

// 3. Prepare dist package.json
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
  dependencies: rootPackage.dependencies,
  devDependencies: rootPackage.devDependencies,
};

fs.writeFileSync(
  path.join(__dirname, '../dist/package.json'),
  JSON.stringify(distPackage, null, 2) + '\n'
);

console.log('✅ dist/package.json generated');
