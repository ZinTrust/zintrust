#!/usr/bin/env node

// CI helper: determines whether we should publish.
// - Reads dist/package.json version (post-build)
// - Fetches npm published version
// - Writes an output `should_publish=true|false` when running in GitHub Actions
// - Exits 0 even when no publish is needed (so master CI stays green)
//
// Usage:
//   node scripts/ci/check-version.js

import { execSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';

const PKG_NAME = '@zintrust/core';

function setGithubOutput(name, value) {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (!outputPath) return;
  try {
    const line = `${name}=${String(value)}\n`;
    // Append to preserve any other outputs.
    appendFileSync(outputPath, line, { encoding: 'utf8' });
  } catch {
    // If writing outputs fails, we still proceed with normal stdout logs.
  }
}

function getDistVersion() {
  try {
    const data = readFileSync('./dist/package.json', 'utf-8');
    const pkg = JSON.parse(data);
    return pkg.version;
  } catch {
    console.error('Could not read dist/package.json. Did you run the build?');
    process.exit(2);
  }
}

function getPublishedVersion() {
  try {
    const out = execSync(`npm view ${PKG_NAME} version --json`, { encoding: 'utf-8' }).trim();
    try {
      return JSON.parse(out);
    } catch {
      return out;
    }
  } catch (err) {
    const msg = String(err?.message ?? err);
    // If package not found, treat as unpublished
    if (msg.includes('404')) {
      return null;
    }
    console.error('Failed to query npm registry:', msg);
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
const shouldPublish = cmp > 0;

setGithubOutput('should_publish', shouldPublish);
setGithubOutput('dist_version', distVersion);

if (!shouldPublish) {
  console.log('No publish needed (version is not greater).');
  process.exit(0);
}

console.log('Version check passed. Proceeding to publish.');
process.exit(0);
