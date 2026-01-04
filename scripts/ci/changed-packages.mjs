import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

const cliArgs = process.argv.slice(2);

function getArgValue(flag) {
  const i = cliArgs.indexOf(flag);
  if (i === -1) return undefined;
  const v = cliArgs[i + 1];
  if (!v || v.startsWith('-')) return undefined;
  return v;
}

const baseShaRaw = getArgValue('--base');
const baseSha = baseShaRaw && /^0+$/.test(baseShaRaw) ? undefined : baseShaRaw;

function isValidCommitish(ref) {
  if (!ref) return false;
  const git = 'git';
  const result = spawnSync(git, ['cat-file', '-e', `${ref}^{commit}`], {
    //NOSONAR

    stdio: 'ignore',
    encoding: 'utf8',
  });
  return result.status === 0;
}

function runGit(args) {
  const git = 'git';
  const result = spawnSync(git, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr || result.stdout}`);
  }

  return (result.stdout ?? '').trim();
}

function writeOutput(key, value) {
  const file = process.env.GITHUB_OUTPUT;
  if (!file) {
    // Local usage: print instead.
    process.stdout.write(`${key}=${value}\n`);
    return;
  }

  fs.appendFileSync(file, `${key}=${value}\n`, 'utf8');
}

function getLastTag() {
  try {
    const tag = runGit(['describe', '--tags', '--abbrev=0']);
    return tag.length ? tag : null;
  } catch {
    return null;
  }
}

function main() {
  const base = isValidCommitish(baseSha) ? baseSha : getLastTag();

  // If there is no previous tag, treat all packages as changed.
  if (!base) {
    writeOutput('packages_changed', 'true');
    writeOutput('changed_package_dirs', '');
    writeOutput('diff_base', '');
    return;
  }

  const changedFiles = runGit(['diff', '--name-only', `${base}...HEAD`, '--', 'packages/'])
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);

  const dirs = new Set();
  for (const f of changedFiles) {
    const m = /^packages\/([^/]+)\//.exec(f);
    if (m && m[1]) dirs.add(m[1]);
  }

  const changed = dirs.size > 0;
  writeOutput('packages_changed', changed ? 'true' : 'false');
  writeOutput('changed_package_dirs', Array.from(dirs).sort().join(','));
  writeOutput('diff_base', base);
}

main();
