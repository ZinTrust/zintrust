import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootPackagePath = path.join(__dirname, '../package.json');
const rootPackage = JSON.parse(fs.readFileSync(rootPackagePath, 'utf-8'));

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
  try {
    const cmd = `npm view ${packageName} version`;
    return execSync(cmd, { encoding: 'utf8', ctdio: ['ignore', 'pipe', 'ignore'] }).trim(); // NOSONAR
  } catch {
    return null;
  }
}

// 1. Determine next version
const isCi = process.env.CI === 'true' || process.env.CI === '1';
const skipNpmVersionCheck = process.env.DIST_SKIP_NPM_VERSION_CHECK === 'true';

const latestPublished = skipNpmVersionCheck ? null : getLatestNpmVersion(rootPackage.name);
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

// 2. Update root package.json if version changed (skip in CI / when requested)
if (!isCi && !skipNpmVersionCheck && finalVersion !== rootPackage.version) {
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
  exports: {
    '.': {
      types: './src/index.d.ts',
      import: './src/index.js',
    },
    './start': {
      types: './src/start.d.ts',
      import: './src/start.js',
    },
    './node': {
      types: './src/node.d.ts',
      import: './src/node.js',
    },
    './routes/*': {
      types: './routes/*.d.ts',
      import: './routes/*.js',
    },
    './package.json': './package.json',
  },
  dependencies: rootPackage.dependencies,
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
