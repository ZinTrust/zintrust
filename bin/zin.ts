#!/usr/bin/env -S node --import tsx

/**
 * ZinTrust CLI Shortcut - 'zin'
 * Mirrors bin/zintrust.ts for convenience
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI_SPAWN_TRACE_ENV_KEYS = ['CLI_SPAWN_TRACE', 'ZIN_SPAWN_TRACE'];

const isCliSpawnTraceEnabled = (): boolean => {
  return CLI_SPAWN_TRACE_ENV_KEYS.some((key) => {
    const raw = process.env[key];
    if (typeof raw !== 'string') return false;

    const normalized = raw.trim().toLowerCase();
    return (
      normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on'
    );
  });
};

const writeCliSpawnTrace = (label: string, details: Record<string, unknown> = {}): void => {
  if (!isCliSpawnTraceEnabled()) return;

  process.stderr.write(
    `${JSON.stringify({ trace: 'cli-wrapper', label, pid: process.pid, details })}\n`
  );
};

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

writeCliSpawnTrace('wrapper.child.started', {
  childPid: child.pid,
  command: process.execPath,
  args: nodeArgs,
});

child.stdout?.on('data', (chunk: string | Buffer) => {
  writeCliSpawnTrace('wrapper.child.stdout.data', {
    childPid: child.pid,
    bytes: typeof chunk === 'string' ? Buffer.byteLength(chunk) : chunk.length,
  });
  process.stdout.write(chunk);
});

child.stdout?.on('end', () => {
  writeCliSpawnTrace('wrapper.child.stdout.end', {
    childPid: child.pid,
  });
});

child.stdout?.on('close', () => {
  writeCliSpawnTrace('wrapper.child.stdout.close', {
    childPid: child.pid,
  });
});

child.stderr?.on('data', (chunk: string | Buffer) => {
  writeCliSpawnTrace('wrapper.child.stderr.data', {
    childPid: child.pid,
    bytes: typeof chunk === 'string' ? Buffer.byteLength(chunk) : chunk.length,
  });
  process.stderr.write(chunk);
});

child.stderr?.on('end', () => {
  writeCliSpawnTrace('wrapper.child.stderr.end', {
    childPid: child.pid,
  });
});

child.stderr?.on('close', () => {
  writeCliSpawnTrace('wrapper.child.stderr.close', {
    childPid: child.pid,
  });
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
    writeCliSpawnTrace('wrapper.signal.forward.attempt', {
      childPid: child.pid,
      signal,
    });
    child.kill(signal);
    writeCliSpawnTrace('wrapper.signal.forward.complete', {
      childPid: child.pid,
      signal,
    });
  } catch {
    // best-effort
  }
};

const scheduleSignalForward = (signal: NodeJS.Signals): void => {
  if (childClosed || delayedSignalTimer !== undefined) return;

  delayedSignalTimer = globalThis.setTimeout(() => {
    delayedSignalTimer = undefined;
    writeCliSpawnTrace('wrapper.signal.delay.fire', {
      childPid: child.pid,
      signal,
    });
    forwardSignal(signal);
  }, 1500);

  writeCliSpawnTrace('wrapper.signal.delay.schedule', {
    childPid: child.pid,
    signal,
    delayMs: 1500,
  });

  (delayedSignalTimer as unknown as { unref?: () => void }).unref?.();
};

const onSigint = (): void => {
  writeCliSpawnTrace('wrapper.signal.received', {
    childPid: child.pid,
    signal: 'SIGINT',
    tty: process.stdin.isTTY === true,
  });
  if (process.stdin.isTTY === true) {
    scheduleSignalForward('SIGINT');
    return;
  }

  forwardSignal('SIGINT');
};

const onSigterm = (): void => {
  writeCliSpawnTrace('wrapper.signal.received', {
    childPid: child.pid,
    signal: 'SIGTERM',
    tty: process.stdin.isTTY === true,
  });
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
      writeCliSpawnTrace('wrapper.child.finalize', {
        childPid: child.pid,
        exitCode: childResult.exitCode,
        signal: childResult.signal,
      });
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
      writeCliSpawnTrace('wrapper.child.exit', {
        childPid: child.pid,
        exitCode,
        signal,
      });
      childResult = { exitCode, signal };
    };

    const handleClose = (exitCode: number | null, signal: NodeJS.Signals | null): void => {
      writeCliSpawnTrace('wrapper.child.close', {
        childPid: child.pid,
        exitCode,
        signal,
      });
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
