#!/usr/bin/env -S node --import tsx

/**
 * ZinTrust CLI Shortcut - 'z'
 * Mirrors bin/zintrust.ts for convenience
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
  stdio: ['inherit', 'pipe', 'pipe'],
  env: process.env,
});

child.stdout?.on('data', (chunk: string | Buffer) => {
  process.stdout.write(chunk);
});

child.stderr?.on('data', (chunk: string | Buffer) => {
  process.stderr.write(chunk);
});

let childClosed = false;
let delayedSignalTimer: ReturnType<typeof setTimeout> | undefined;

const clearDelayedSignal = (): void => {
  if (delayedSignalTimer === undefined) return;
  clearTimeout(delayedSignalTimer);
  delayedSignalTimer = undefined;
};

const forwardSignal = (signal: NodeJS.Signals): void => {
  if (childClosed) return;
  try {
    child.kill(signal);
  } catch {
    // best-effort
  }
};

const scheduleSignalForward = (signal: NodeJS.Signals): void => {
  if (childClosed || delayedSignalTimer !== undefined) return;

  delayedSignalTimer = globalThis.setTimeout(() => {
    delayedSignalTimer = undefined;
    forwardSignal(signal);
  }, 1500);

  (delayedSignalTimer as unknown as { unref?: () => void }).unref?.();
};

const onSigint = (): void => {
  if (process.stdin.isTTY === true) {
    scheduleSignalForward('SIGINT');
    return;
  }

  forwardSignal('SIGINT');
};

const onSigterm = (): void => {
  if (process.stdin.isTTY === true) {
    scheduleSignalForward('SIGTERM');
    return;
  }

  forwardSignal('SIGTERM');
};

process.on('SIGINT', onSigint);
process.on('SIGTERM', onSigterm);

const result = await new Promise<{ exitCode: number | null; signal: NodeJS.Signals | null }>(
  (resolve, reject) => {
    let settled = false;
    let childResult: { exitCode: number | null; signal: NodeJS.Signals | null } = {
      exitCode: null,
      signal: null,
    };

    const finalize = (): void => {
      if (settled) {
        return;
      }
      settled = true;
      childClosed = true;
      clearDelayedSignal();
      process.off('SIGINT', onSigint);
      process.off('SIGTERM', onSigterm);
      child.off?.('error', reject);
      child.off?.('exit', handleExit);
      child.off?.('close', handleClose);
      resolve(childResult);
    };

    const handleExit = (exitCode: number | null, signal: NodeJS.Signals | null): void => {
      childResult = { exitCode, signal };
    };

    const handleClose = (exitCode: number | null, signal: NodeJS.Signals | null): void => {
      childResult = {
        exitCode: childResult.exitCode ?? exitCode,
        signal: childResult.signal ?? signal,
      };
      finalize();
    };

    child.once('error', reject);
    child.once('exit', handleExit);
    child.once('close', handleClose);
  }
);

process.exit(
  result.exitCode ?? (result.signal === 'SIGINT' || result.signal === 'SIGTERM' ? 0 : 1)
);
