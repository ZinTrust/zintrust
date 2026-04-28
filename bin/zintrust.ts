#!/usr/bin/env -S node --import tsx

/**
 * ZinTrust CLI - Main Entry Point
 *
 * This bin script is a thin wrapper around the hashbang-free implementation in
 * bin/zintrust-main.ts. Keeping the implementation hashbang-free allows other
 * shortcuts (zin/z/zt) to import it without parse issues.
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const tsTarget = path.join(here, 'zintrust-main.ts');
const jsTarget = path.join(here, 'zintrust-main.js');
const target = existsSync(tsTarget) ? tsTarget : jsTarget;
const tsxImportPath = require.resolve('tsx');
const nodeArgs = target.endsWith('.ts')
  ? ['--import', tsxImportPath, target, ...process.argv.slice(2)]
  : [target, ...process.argv.slice(2)];

const child = spawn(process.execPath, nodeArgs, {
  stdio: 'inherit',
  env: process.env,
});

const result = await new Promise<{ exitCode: number | null; signal: NodeJS.Signals | null }>(
  (resolve, reject) => {
    let settled = false;
    const finalize = (exitCode: number | null, signal: NodeJS.Signals | null): void => {
      if (settled) {
        return;
      }
      settled = true;
      child.off?.('error', reject);
      child.off?.('exit', finalize);
      child.off?.('close', finalize);
      resolve({ exitCode, signal });
    };

    child.once('error', reject);
    child.once('exit', finalize);
    child.once('close', finalize);
  }
);

process.exit(
  result.exitCode ?? (result.signal === 'SIGINT' || result.signal === 'SIGTERM' ? 0 : 1)
);
export {};
