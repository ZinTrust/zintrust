#!/usr/bin/env node

// CI helper: compute and (optionally) apply a SemVer bump based on Conventional Commits.
// Rules:
// - major: any commit with BREAKING CHANGE footer/body OR "!" after type/scope (e.g. feat!:)
// - minor: any feat
// - patch: any fix
//
// Designed for release -> master flow:
// - compares commits in origin/master..HEAD
// - ignores merge commits and chore(release) commits
//
// Usage:
//   node scripts/ci/bump-version.js --apply
//   node scripts/ci/bump-version.js

import { execSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';

const APPLY = process.argv.includes('--apply');

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

function detectBump(messages) {
  let bump = 'none';

  const mark = (next) => {
    if (next === 'major') bump = 'major';
    else if (next === 'minor' && bump !== 'major') bump = 'minor';
    else if (next === 'patch' && bump === 'none') bump = 'patch';
  };

  for (const msg of messages) {
    if (isReleaseCommit(msg)) continue;

    const lower = msg.toLowerCase();

    // BREAKING CHANGE footer/body
    if (lower.includes('breaking change') || lower.includes('breaking-change')) {
      mark('major');
      continue;
    }

    const firstLine = msg.split('\n')[0] ?? '';
    // Conventional commit header: type(scope)!: subject
    if (/^[a-z]+(\([^)]+\))?!:/.test(firstLine)) {
      mark('major');
      continue;
    }

    if (/^feat(\([^)]+\))?:/.test(firstLine)) {
      mark('minor');
      continue;
    }

    if (/^fix(\([^)]+\))?:/.test(firstLine)) {
      mark('patch');
    }
  }

  return bump;
}

function applyBump(bumpType) {
  if (bumpType === 'none') return null;

  // Update package.json + package-lock.json without creating a git tag.
  run(`npm version ${bumpType} --no-git-tag-version`);

  const pkg = readJson('./package.json');
  return pkg.version;
}

// Ensure refs exist
run('git fetch origin master --quiet');

const range = 'origin/master..HEAD';
const messages = getCommitMessages(range);
const bumpType = detectBump(messages);

setGithubOutput('bump_type', bumpType);
setGithubOutput('should_bump', bumpType !== 'none');

console.log(`Commit range: ${range}`);
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
