import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(scriptsDir, '..');

const extensionDirs = readdirSync(workspaceRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name.startsWith('zintrust-'))
  .map((entry) => entry.name)
  .sort((left, right) => left.localeCompare(right));

for (const extensionDir of extensionDirs) {
  console.log(`== ${extensionDir} ==`);

  const manifest = JSON.parse(
    readFileSync(path.join(workspaceRoot, extensionDir, 'package.json'), 'utf8')
  );

  if (manifest.scripts?.compile) {
    run('npm', ['--workspace', extensionDir, 'run', 'compile'], workspaceRoot);
  }

  if (manifest.scripts?.package) {
    run('npm', ['--workspace', extensionDir, 'run', 'package'], workspaceRoot);
  }
}

console.log('All ZinTrust extensions validated successfully.');

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit' });
  if (result.status === 0) {
    return;
  }

  throw new Error(`${command} ${args.join(' ')} failed with exit code ${String(result.status)}`);
}
