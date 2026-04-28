#!/usr/bin/env -S node --import tsx

/**
 * ZinTrust CLI Shortcut - 'z'
 * Mirrors bin/zintrust.ts for convenience
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const tsTarget = path.join(here, 'zintrust-main.ts');
const jsTarget = path.join(here, 'zintrust-main.js');
const target = existsSync(tsTarget) ? tsTarget : jsTarget;
const nodeArgs = target.endsWith('.ts')
  ? ['--import', 'tsx', target, ...process.argv.slice(2)]
  : [target, ...process.argv.slice(2)];

const child = spawn(process.execPath, nodeArgs, {
  stdio: 'inherit',
  env: process.env,
});

const result = await new Promise<{ exitCode: number | null; signal: NodeJS.Signals | null }>(
  (resolve, reject) => {
    child.once('error', reject);
    child.once('close', (exitCode: number | null, signal: NodeJS.Signals | null) => {
      resolve({ exitCode, signal });
    });
  }
);

process.exit(
  result.exitCode ?? (result.signal === 'SIGINT' || result.signal === 'SIGTERM' ? 0 : 1)
);
