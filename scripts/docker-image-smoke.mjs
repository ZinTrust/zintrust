#!/usr/bin/env node

import { execFileSync } from 'node:child_process';

const mode = (process.argv[2] ?? 'base').trim().toLowerCase();

const runtimeTarget = mode === 'worker' ? 'worker' : 'runtime';
const imageTag = mode === 'worker' ? 'zintrust-worker:smoke' : 'zintrust:smoke';

const run = (args) => {
  execFileSync('docker', args, { stdio: 'inherit' });
};

const js =
  mode === 'worker'
    ? [
        "const { PluginAutoImports } = await import('./dist/src/runtime/PluginAutoImports.js');",
        "const result = await PluginAutoImports.tryImportRuntimeAutoImports('worker');",
        "if (!result.ok) throw new Error(result.errorMessage ?? 'worker auto-imports failed');",
      ].join(' ')
    : [
        "const { PluginAutoImports } = await import('./dist/src/runtime/PluginAutoImports.js');",
        "const result = await PluginAutoImports.tryImportRuntimeAutoImports('base');",
        "if (!result.ok) throw new Error(result.errorMessage ?? 'base auto-imports failed');",
      ].join(' ');

run(['build', '--target', runtimeTarget, '-t', imageTag, '.']);
run(['run', '--rm', '--entrypoint', 'node', imageTag, '--input-type=module', '-e', js]);

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
