import { spawnSync } from 'node:child_process';

const maxAttempts = 3;

function runCommand(command, args) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    env: process.env,
  });

  if (result.error) {
    throw result.error;
  }

  return result.status ?? 1;
}

function npmMajorVersion() {
  const result = spawnSync('npm', ['--version'], { encoding: 'utf8' });
  if (result.error || result.status !== 0) {
    return 0;
  }

  const major = Number.parseInt(String(result.stdout).trim(), 10);
  return Number.isFinite(major) ? major : 0;
}

// npm 10's arborist throws `Cannot read properties of null (reading 'edgesOut')`
// from #loadPeerSet when a peer set detaches a node. npm 11 has that guard.
// Node 20 and current Node 22 builds still ship npm 10.
function npmInstallInvocation() {
  const installArgs = ['install', '--no-audit', '--no-fund'];
  if (npmMajorVersion() >= 11) {
    return { command: 'npm', args: installArgs };
  }

  return { command: 'npx', args: ['--yes', 'npm@11', ...installArgs] };
}

for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
  process.stdout.write(
    `\n[publish-preflight] Attempt ${attempt}/${maxAttempts}: updating dependency ranges with npm-check-updates\n`
  );

  const syncStatus = runCommand('npx', ['npm-check-updates', '-u']);
  if (syncStatus !== 0) {
    process.exit(syncStatus);
  }

  const install = npmInstallInvocation();
  process.stdout.write(
    `[publish-preflight] Attempt ${attempt}/${maxAttempts}: running ${install.command} ${install.args.join(' ')}\n`
  );

  const installStatus = runCommand(install.command, install.args);
  if (installStatus === 0) {
    process.stdout.write(
      `[publish-preflight] Dependency install succeeded on attempt ${attempt}/${maxAttempts}\n`
    );
    process.exit(0);
  }

  if (attempt < maxAttempts) {
    process.stderr.write(
      `[publish-preflight] npm install failed on attempt ${attempt}/${maxAttempts}; retrying after another npm-check-updates refresh\n`
    );
  }
}

process.stderr.write(
  `[publish-preflight] npm install still failed after ${maxAttempts} attempts\n`
);
process.exit(1);
