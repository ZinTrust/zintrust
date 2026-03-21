#!/usr/bin/env node

import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
const mode = (args[0] ?? 'base').trim().toLowerCase();

let skipBuild = false;
let imageTag = mode === 'worker' ? 'zintrust-worker:smoke' : 'zintrust:smoke';

for (let index = 1; index < args.length; index += 1) {
  const arg = args[index];
  if (arg === '--skip-build') {
    skipBuild = true;
    continue;
  }

  if (arg === '--image') {
    const value = args[index + 1];
    if (typeof value === 'string' && value.trim() !== '') {
      imageTag = value.trim();
      index += 1;
    }
  }
}

const runtimeTarget = mode === 'worker' ? 'worker' : 'runtime';

const run = (args) => {
  execFileSync('docker', args, { stdio: 'inherit' });
};

const smokeProbe =
  mode === 'worker'
    ? [
        "const { PluginAutoImports } = await import('./dist/src/runtime/PluginAutoImports.js');",
        "const result = await PluginAutoImports.tryImportRuntimeAutoImports('worker');",
        "if (!result.ok) throw new Error(result.errorMessage ?? 'worker auto-imports failed');",
        "console.log('worker imports ok');",
      ].join(' ')
    : [
        "const { PluginAutoImports } = await import('./dist/src/runtime/PluginAutoImports.js');",
        "const result = await PluginAutoImports.tryImportRuntimeAutoImports('base');",
        "if (!result.ok) throw new Error(result.errorMessage ?? 'base auto-imports failed');",
        "console.log('base imports ok');",
      ].join(' ');

if (!skipBuild) {
  run(['build', '--target', runtimeTarget, '-t', imageTag, '.']);
}

run(['run', '--rm', '--entrypoint', 'node', imageTag, '--input-type=module', '-e', smokeProbe]);

if (mode === 'worker') {
  run([
    'run',
    '--rm',
    '-e',
    'WORKER_AUTO_START=false',
    '-e',
    'WORKER_ENABLED=true',
    '-e',
    'QUEUE_ENABLED=true',
    imageTag,
    'node',
    'dist/bin/zin.js',
    'worker:start-all',
  ]);
}
