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

for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
  process.stdout.write(
    `\n[publish-preflight] Attempt ${attempt}/${maxAttempts}: updating dependency ranges with npm-check-updates\n`
  );

  const syncStatus = runCommand('npx', ['npm-check-updates', '-u']);
  if (syncStatus !== 0) {
    process.exit(syncStatus);
  }

  process.stdout.write(
    `[publish-preflight] Attempt ${attempt}/${maxAttempts}: running npm install\n`
  );

  const installStatus = runCommand('npm', ['install', '--no-audit', '--no-fund']);
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
