import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

type RunCliWrapperInput = {
  traceName?: string;
};

const CLI_SPAWN_TRACE_ENV_KEYS = ['CLI_SPAWN_TRACE', 'ZIN_SPAWN_TRACE'];

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

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

const writeCliSpawnTrace = (
  input: RunCliWrapperInput,
  label: string,
  details: Record<string, unknown> = {}
): void => {
  if (input.traceName === undefined || !isCliSpawnTraceEnabled()) return;

  process.stderr.write(
    `${JSON.stringify({ trace: input.traceName, label, pid: process.pid, details })}\n`
  );
};

const resolveNodeArgs = (): string[] => {
  const tsTarget = path.join(here, 'zintrust-main.ts');
  const jsTarget = path.join(here, 'zintrust-main.js');
  const target = existsSync(tsTarget) ? tsTarget : jsTarget;

  if (!target.endsWith('.ts')) {
    return [target, ...process.argv.slice(2)];
  }

  return ['--import', require.resolve('tsx'), target, ...process.argv.slice(2)];
};

const getExitCode = (exitCode: number | null, signal: NodeJS.Signals | null): number => {
  if (typeof exitCode === 'number') return exitCode;
  if (signal === 'SIGINT' || signal === 'SIGTERM') return 0;
  return 1;
};

const attachOutputRelay = (
  input: RunCliWrapperInput,
  child: ReturnType<typeof spawn>,
  stream: 'stdout' | 'stderr'
): void => {
  const childStream = child[stream];
  const targetStream = stream === 'stdout' ? process.stdout : process.stderr;

  childStream?.on('data', (chunk: string | Buffer) => {
    writeCliSpawnTrace(input, `wrapper.child.${stream}.data`, {
      childPid: child.pid,
      bytes: typeof chunk === 'string' ? Buffer.byteLength(chunk) : chunk.length,
    });
    targetStream.write(chunk);
  });
};

const waitForChildClose = async (
  input: RunCliWrapperInput,
  child: ReturnType<typeof spawn>,
  onBeforeResolve: () => void
): Promise<{ exitCode: number | null; signal: NodeJS.Signals | null }> => {
  return new Promise((resolve, reject) => {
    let settled = false;
    let childResult: { exitCode: number | null; signal: NodeJS.Signals | null } = {
      exitCode: null,
      signal: null,
    };

    const finalize = (): void => {
      if (settled) return;

      settled = true;
      onBeforeResolve();
      child.off?.('error', reject);
      child.off?.('exit', handleExit);
      child.off?.('close', handleClose);
      writeCliSpawnTrace(input, 'wrapper.child.finalize', {
        childPid: child.pid,
        exitCode: childResult.exitCode,
        signal: childResult.signal,
      });
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
  });
};

const registerSignalHandlers = (
  input: RunCliWrapperInput,
  child: ReturnType<typeof spawn>
): (() => void) => {
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
      writeCliSpawnTrace(input, 'wrapper.signal.forward', {
        childPid: child.pid,
        signal,
      });
      child.kill(signal);
    } catch {
      // best-effort
    }
  };

  const scheduleSignalForward = (signal: NodeJS.Signals): void => {
    if (childClosed || delayedSignalTimer !== undefined) return;

    delayedSignalTimer = globalThis.setTimeout(() => {
      delayedSignalTimer = undefined;
      writeCliSpawnTrace(input, 'wrapper.signal.delay.fire', {
        childPid: child.pid,
        signal,
      });
      forwardSignal(signal);
    }, 1500);

    writeCliSpawnTrace(input, 'wrapper.signal.delay.schedule', {
      childPid: child.pid,
      signal,
      delayMs: 1500,
    });

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

  return (): void => {
    childClosed = true;
    clearDelayedSignal();
    process.off('SIGINT', onSigint);
    process.off('SIGTERM', onSigterm);
  };
};

export const runCliWrapper = async (input: RunCliWrapperInput = {}): Promise<void> => {
  const nodeArgs = resolveNodeArgs();
  const child = spawn(process.execPath, nodeArgs, {
    stdio: ['inherit', 'pipe', 'pipe'],
    env: process.env,
  });

  writeCliSpawnTrace(input, 'wrapper.child.started', {
    childPid: child.pid,
    command: process.execPath,
    args: nodeArgs,
  });

  attachOutputRelay(input, child, 'stdout');
  attachOutputRelay(input, child, 'stderr');

  const unregisterSignalHandlers = registerSignalHandlers(input, child);
  const result = await waitForChildClose(input, child, unregisterSignalHandlers);

  process.exit(getExitCode(result.exitCode, result.signal));
};
