#!/usr/bin/env node

// Checks that the built dist/package.json version is greater than the latest published version
// Usage: node scripts/ci/check-version.js

import { execSync } from 'child_process';
import { readFileSync } from 'fs';

const PKG_NAME = '@zintrust/core';

function getDistVersion() {
  try {
    const data = readFileSync('./dist/package.json', 'utf-8');
    const pkg = JSON.parse(data);
    return pkg.version;
  } catch (err) {
    console.error('Could not read dist/package.json. Did you run the build?');
    process.exit(2);
  }
}

function getPublishedVersion() {
  try {
    const out = execSync(`npm view ${PKG_NAME} version --json`, { encoding: 'utf-8' }).trim();
    // npm view may output a JSON string or a bare string
    try {
      return JSON.parse(out);
    } catch {
      return out;
    }
  } catch (err) {
    // If package not found, treat as unpublished
    if (err.message && err.message.includes('404')) {
      return null;
    }
    console.error('Failed to query npm registry:', err.message);
    process.exit(3);
  }
}

function compareVersions(a, b) {
  if (!b) return 1; // nothing published yet
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return 1;
    if ((pa[i] || 0) < (pb[i] || 0)) return -1;
  }
  return 0;
}

const distVersion = getDistVersion();
const publishedVersion = getPublishedVersion();

console.log(`Dist version: ${distVersion}`);
console.log(`Published version: ${publishedVersion ?? 'none'}`);

const cmp = compareVersions(distVersion, publishedVersion);
if (cmp <= 0) {
  console.error(`Abort: dist version (${distVersion}) is not greater than published (${publishedVersion ?? 'none'})`);
  process.exit(1);
}

console.log('Version check passed. Proceeding to publish.');
process.exit(0);
