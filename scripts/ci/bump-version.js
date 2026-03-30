#!/usr/bin/env node

// CI helper: compute and (optionally) apply a SemVer bump.
// Default project policy is patch-only automation:
// - any releasable commit (fix/feat/breaking) becomes a patch bump
// - minor/major bumps must be done intentionally, not inferred automatically
//
// Designed for release -> master flow:
// - compares commits in origin/master..HEAD
// - ignores merge commits and chore(release) commits
//
// Usage:
//   node scripts/ci/bump-version.js --apply
//   node scripts/ci/bump-version.js
//   node scripts/ci/bump-version.js --strategy conventional

import { execSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';

const APPLY = process.argv.includes('--apply');

function getArgValue(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return undefined;
  const value = process.argv[index + 1];
  if (!value || value.startsWith('--')) return undefined;
  return value;
}

const STRATEGY =
  getArgValue('--strategy') ?? process.env.ZINTRUST_RELEASE_BUMP_STRATEGY ?? 'patch-only';

if (!['patch-only', 'conventional'].includes(STRATEGY)) {
  throw new Error(
    `Unsupported bump strategy: ${STRATEGY}. Expected "patch-only" or "conventional".`
  );
}

function setGithubOutput(name, value) {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (!outputPath) return;
  try {
    appendFileSync(outputPath, `${name}=${String(value)}\n`, { encoding: 'utf8' });
  } catch {
    // ignore
  }
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function run(cmd) {
  return execSync(cmd, { encoding: 'utf8' }).trim();
}

function getCommitMessages(range) {
  // %B = raw body (subject + body)
  const out = run(`git log --no-merges --format=%B ${range}`);
  if (!out) return [];
  return out
    .split('\n\n')
    .map((s) => s.trim())
    .filter(Boolean);
}

function isReleaseCommit(message) {
  return message.startsWith('chore(release):');
}

function detectCommitBump(message) {
  const lower = message.toLowerCase();

  // BREAKING CHANGE footer/body
  if (lower.includes('breaking change') || lower.includes('breaking-change')) {
    return 'major';
  }

  const firstLine = message.split('\n')[0] ?? '';
  // Conventional commit header: type(scope)!: subject
  if (/^[a-z]+(\([^)]+\))?!:/.test(firstLine)) {
    return 'major';
  }

  if (/^feat(\([^)]+\))?:/.test(firstLine)) {
    return 'minor';
  }

  if (/^fix(\([^)]+\))?:/.test(firstLine)) {
    return 'patch';
  }

  return 'none';
}

function detectBump(messages, strategy) {
  let bump = 'none';

  const mark = (next) => {
    if (next === 'major') bump = 'major';
    else if (next === 'minor' && bump !== 'major') bump = 'minor';
    else if (next === 'patch' && bump === 'none') bump = 'patch';
  };

  for (const msg of messages) {
    if (isReleaseCommit(msg)) continue;
    const next = detectCommitBump(msg);
    if (next === 'none') continue;

    if (strategy === 'patch-only') {
      return 'patch';
    }

    mark(next);
  }

  return bump;
}

function applyBump(bumpType) {
  if (bumpType === 'none') return null;

  // Update package.json + package-lock.json without creating a git tag.
  run(`npm version ${bumpType} --no-git-tag-version`);

  // Keep all workspace package versions, peer ranges, and workspace lockfile entries aligned
  // with the new core version so the CI sync check remains green after the bump commit.
  run('node scripts/release/sync-package-versions.mjs');

  // Workaround: `workflow_run` workflows use the workflow definition from the default branch.
  // The `release-pr.yml` in `master` might be missing `packages/*/package.json` in its `git add` step.
  // We stage them here so the subsequent `git commit` includes them.
  run('git add package.json package-lock.json packages/*/package.json');

  const pkg = readJson('./package.json');
  return pkg.version;
}

// Ensure refs exist
run('git fetch origin master --quiet');

const range = 'origin/master..HEAD';
const messages = getCommitMessages(range);
const bumpType = detectBump(messages, STRATEGY);

setGithubOutput('bump_type', bumpType);
setGithubOutput('bump_strategy', STRATEGY);
setGithubOutput('should_bump', bumpType !== 'none');

console.log(`Commit range: ${range}`);
console.log(`Bump strategy: ${STRATEGY}`);
console.log(`Detected bump: ${bumpType}`);

if (!APPLY || bumpType === 'none') {
  process.exit(0);
}

const newVersion = applyBump(bumpType);
if (!newVersion) {
  process.exit(0);
}

setGithubOutput('new_version', newVersion);
console.log(`Bumped version to: ${newVersion}`);
process.exit(0);
