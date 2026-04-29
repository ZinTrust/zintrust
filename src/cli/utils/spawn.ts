import { appConfig } from '@config/app';
import { ErrorFactory } from '@exceptions/ZintrustError';
import { spawn } from '@node-singletons/child-process';
import { existsSync } from '@node-singletons/fs';
import * as path from '@node-singletons/path';
import { fileURLToPath } from '@node-singletons/url';

export interface SpawnAndWaitInput {
  command: string;
  args: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  forwardSignals?: boolean;
  ttySignalForwardDelayMs?: number;
  shell?: boolean;
}

const CLI_SPAWN_TRACE_ENV_KEYS = ['CLI_SPAWN_TRACE', 'ZIN_SPAWN_TRACE'];

const getCliSpawnTracePid = (): number | undefined => {
  if (typeof process === 'undefined') return undefined;
  return process.pid;
};

const isCliSpawnTraceEnabled = (): boolean => {
  if (typeof process === 'undefined') return false;

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

  const line = JSON.stringify({
    trace: 'cli-spawn',
    label,
    pid: getCliSpawnTracePid(),
    details,
  });

  if (typeof process !== 'undefined' && typeof process.stderr?.write === 'function') {
    process.stderr.write(`${line}\n`);
  }
};

const getExitCode = (exitCode: number | null, signal: NodeJS.Signals | null): number => {
  if (typeof exitCode === 'number') return exitCode;
  if (signal === 'SIGINT' || signal === 'SIGTERM') return 0;
  return 1;
};

const CURRENT_PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

const buildBinCandidates = (binDir: string, command: string): string[] =>
  process.platform === 'win32'
    ? [
        path.join(binDir, `${command}.cmd`),
        path.join(binDir, `${command}.exe`),
        path.join(binDir, `${command}.bat`),
        path.join(binDir, command),
      ]
    : [path.join(binDir, command)];

const resolveLocalBin = (command: string, cwd: string): string => {
  // If command is already a path, leave it alone.
  if (command.includes('/') || command.includes('\\')) return command;

  const binDirs = [
    path.join(cwd, 'node_modules', '.bin'),
    path.join(CURRENT_PACKAGE_ROOT, 'node_modules', '.bin'),
  ].filter((value, index, items) => items.indexOf(value) === index);

  for (const binDir of binDirs) {
    for (const candidate of buildBinCandidates(binDir, command)) {
      if (existsSync(candidate)) return candidate;
    }
  }

  return command;
};

const buildCommandNotFoundMessage = (command: string): string => {
  if (command === 'tsx') {
    return [
      "Error: 'tsx' not found on PATH.",
      'Install it in the project with "npm install -D tsx".',
    ].join(' ');
  }

  return `Error: '${command}' not found on PATH.`;
};

const waitForChildExit = async (
  child: ReturnType<typeof spawn>,
  onExit: () => void
): Promise<{ exitCode: number | null; signal: NodeJS.Signals | null }> => {
  return new Promise<{ exitCode: number | null; signal: NodeJS.Signals | null }>(
    (resolve, reject) => {
      let settled = false;
      let childResult: { exitCode: number | null; signal: NodeJS.Signals | null } = {
        exitCode: null,
        signal: null,
      };

      const finish = (): void => {
        if (settled) return;
        settled = true;
        writeCliSpawnTrace('spawn.wait.finish', {
          childPid: child.pid,
          exitCode: childResult.exitCode,
          signal: childResult.signal,
        });
        child.off?.('exit', onExitEvent);
        child.off?.('close', onCloseEvent);
        onExit();
        resolve(childResult);
      };

      const onExitEvent = (code: number | null, signal: NodeJS.Signals | null): void => {
        writeCliSpawnTrace('spawn.child.exit', {
          childPid: child.pid,
          exitCode: code,
          signal,
        });
        childResult = { exitCode: code, signal };
      };

      const onCloseEvent = (code: number | null, signal: NodeJS.Signals | null): void => {
        writeCliSpawnTrace('spawn.child.close', {
          childPid: child.pid,
          exitCode: code,
          signal,
        });
        childResult = {
          exitCode: childResult.exitCode ?? code,
          signal: childResult.signal ?? signal,
        };
        finish();
      };

      child.once('error', (error: unknown) => {
        writeCliSpawnTrace('spawn.child.error', {
          childPid: child.pid,
          error: error instanceof Error ? error.message : String(error),
        });
        reject(error);
      });

      child.once('exit', onExitEvent);
      child.once('close', onCloseEvent);
    }
  );
};

const resolveSignalHandling = (
  input: SpawnAndWaitInput
): {
  forwardSignals: boolean;
  ttySignalForwardDelayMs: number;
} => {
  const forwardSignals =
    typeof input.forwardSignals === 'boolean' ? input.forwardSignals : !process.stdin.isTTY;
  const ttySignalForwardDelayMs =
    process.stdin.isTTY === true && forwardSignals === false
      ? Math.max(0, input.ttySignalForwardDelayMs ?? 0)
      : 0;

  return {
    forwardSignals,
    ttySignalForwardDelayMs,
  };
};

const spawnChildProcess = (input: {
  command: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  shell: boolean;
}): ReturnType<typeof spawn> => {
  writeCliSpawnTrace('spawn.child.start', {
    command: input.command,
    args: input.args,
    cwd: input.cwd,
    shell: input.shell,
  });

  const child = spawn(input.command, input.args, {
    cwd: input.cwd,
    env: input.env,
    stdio: ['inherit', 'pipe', 'pipe'],
    shell: input.shell,
  });

  child.stdout?.on('data', (chunk: string | Buffer) => {
    writeCliSpawnTrace('spawn.child.stdout.data', {
      childPid: child.pid,
      bytes: typeof chunk === 'string' ? Buffer.byteLength(chunk) : chunk.length,
    });
    process.stdout.write(chunk);
  });

  child.stdout?.on('end', () => {
    writeCliSpawnTrace('spawn.child.stdout.end', {
      childPid: child.pid,
    });
  });

  child.stdout?.on('close', () => {
    writeCliSpawnTrace('spawn.child.stdout.close', {
      childPid: child.pid,
    });
  });

  child.stderr?.on('data', (chunk: string | Buffer) => {
    writeCliSpawnTrace('spawn.child.stderr.data', {
      childPid: child.pid,
      bytes: typeof chunk === 'string' ? Buffer.byteLength(chunk) : chunk.length,
    });
    process.stderr.write(chunk);
  });

  child.stderr?.on('end', () => {
    writeCliSpawnTrace('spawn.child.stderr.end', {
      childPid: child.pid,
    });
  });

  child.stderr?.on('close', () => {
    writeCliSpawnTrace('spawn.child.stderr.close', {
      childPid: child.pid,
    });
  });

  writeCliSpawnTrace('spawn.child.started', {
    childPid: child.pid,
    command: input.command,
  });

  return child;
};

const createForwardSignal = (input: {
  child: ReturnType<typeof spawn>;
}): ((signal: NodeJS.Signals) => void) => {
  return (signal: NodeJS.Signals): void => {
    writeCliSpawnTrace('spawn.signal.forward.attempt', {
      childPid: input.child.pid,
      signal,
    });
    try {
      input.child.kill(signal);
      writeCliSpawnTrace('spawn.signal.forward.complete', {
        childPid: input.child.pid,
        signal,
      });
    } catch (error) {
      writeCliSpawnTrace('spawn.signal.forward.failed', {
        childPid: input.child.pid,
        signal,
        error: error instanceof Error ? error.message : String(error),
      });
      const wrapped = ErrorFactory.createTryCatchError(
        'Failed to forward signal to child process',
        error
      );

      try {
        process.stderr.write(`${String(wrapped.message)}\n`);
      } catch {
        // ignore
      }

      throw wrapped;
    }
  };
};

const createSignalHandlers = (input: {
  forwardSignals: boolean;
  delayedSignalForwarder: { schedule: (signal: NodeJS.Signals) => void };
  forwardSignal: (signal: NodeJS.Signals) => void;
}): {
  onSigint: () => void;
  onSigterm: () => void;
} => {
  const onSigint = (): void => {
    writeCliSpawnTrace('spawn.signal.received', {
      signal: 'SIGINT',
      forwardSignals: input.forwardSignals,
    });
    if (input.forwardSignals) {
      input.forwardSignal('SIGINT');
      return;
    }

    input.delayedSignalForwarder.schedule('SIGINT');
  };

  const onSigterm = (): void => {
    writeCliSpawnTrace('spawn.signal.received', {
      signal: 'SIGTERM',
      forwardSignals: input.forwardSignals,
    });
    if (input.forwardSignals) {
      input.forwardSignal('SIGTERM');
      return;
    }

    input.delayedSignalForwarder.schedule('SIGTERM');
  };

  return { onSigint, onSigterm };
};

const createDelayedSignalForwarder = (input: {
  ttySignalForwardDelayMs: number;
  isChildClosed: () => boolean;
  forwardSignal: (signal: NodeJS.Signals) => void;
}): {
  clear: () => void;
  schedule: (signal: NodeJS.Signals) => void;
} => {
  let delayedSignalTimer: ReturnType<typeof setTimeout> | undefined;
  let escalationTimer: ReturnType<typeof setTimeout> | undefined;

  const clearEscalation = (): void => {
    if (escalationTimer === undefined) return;
    clearTimeout(escalationTimer);
    escalationTimer = undefined;
  };

  const clear = (): void => {
    if (delayedSignalTimer !== undefined) {
      clearTimeout(delayedSignalTimer);
      delayedSignalTimer = undefined;
    }

    clearEscalation();
    writeCliSpawnTrace('spawn.signal.delay.clear');
  };

  const scheduleEscalation = (signal: NodeJS.Signals): void => {
    if (escalationTimer !== undefined || input.isChildClosed()) return;

    const nextSignal: NodeJS.Signals = signal === 'SIGINT' ? 'SIGTERM' : signal;
    const escalationDelayMs = Math.max(250, Math.min(1000, input.ttySignalForwardDelayMs));

    escalationTimer = globalThis.setTimeout(() => {
      escalationTimer = undefined;
      if (input.isChildClosed()) return;

      try {
        writeCliSpawnTrace('spawn.signal.escalation.fire', {
          signal: nextSignal,
        });
        input.forwardSignal(nextSignal);
      } catch {
        // best-effort fallback for interactive watch processes
      }
    }, escalationDelayMs);

    (escalationTimer as unknown as { unref?: () => void }).unref?.();
  };

  const schedule = (signal: NodeJS.Signals): void => {
    if (
      input.ttySignalForwardDelayMs <= 0 ||
      delayedSignalTimer !== undefined ||
      input.isChildClosed()
    ) {
      return;
    }

    delayedSignalTimer = globalThis.setTimeout(() => {
      delayedSignalTimer = undefined;
      if (input.isChildClosed()) return;

      try {
        writeCliSpawnTrace('spawn.signal.delay.fire', {
          signal,
        });
        input.forwardSignal(signal);
        scheduleEscalation(signal);
      } catch {
        // best-effort fallback for interactive watch processes
      }
    }, input.ttySignalForwardDelayMs);

    writeCliSpawnTrace('spawn.signal.delay.schedule', {
      signal,
      delayMs: input.ttySignalForwardDelayMs,
    });

    (delayedSignalTimer as unknown as { unref?: () => void }).unref?.();
  };

  return { clear, schedule };
};

export const SpawnUtil = Object.freeze({
  async spawnAndWait(input: SpawnAndWaitInput): Promise<number> {
    const cwd = input.cwd ?? process.cwd();
    const resolvedCommand =
      input.shell === true ? input.command : resolveLocalBin(input.command, cwd);
    const signalHandling = resolveSignalHandling(input);
    writeCliSpawnTrace('spawn.and-wait.start', {
      command: resolvedCommand,
      args: input.args,
      cwd,
      shell: input.shell === true,
      forwardSignals: signalHandling.forwardSignals,
      ttySignalForwardDelayMs: signalHandling.ttySignalForwardDelayMs,
    });
    const child = spawnChildProcess({
      command: resolvedCommand,
      args: input.args,
      cwd,
      env: input.env ?? appConfig.getSafeEnv(),
      shell: input.shell === true,
    });

    // In interactive shells, the foreground process group already receives SIGINT
    // (and often SIGTERM) so forwarding can cause duplicates. `tsx watch` is
    // especially sensitive here and can print "Previous process hasn't exited yet. Force killing...".
    const forwardSignals = signalHandling.forwardSignals;
    const ttySignalForwardDelayMs = signalHandling.ttySignalForwardDelayMs;
    let childClosed = false;

    const forwardSignal = createForwardSignal({ child });
    const delayedSignalForwarder = createDelayedSignalForwarder({
      ttySignalForwardDelayMs,
      isChildClosed: () => childClosed,
      forwardSignal,
    });
    const { onSigint, onSigterm } = createSignalHandlers({
      forwardSignals,
      delayedSignalForwarder,
      forwardSignal,
    });

    process.on('SIGINT', onSigint);
    process.on('SIGTERM', onSigterm);
    writeCliSpawnTrace('spawn.signal.handlers.registered', {
      childPid: child.pid,
    });

    try {
      const result = await waitForChildExit(child, () => {
        childClosed = true;
        delayedSignalForwarder.clear();
        writeCliSpawnTrace('spawn.child.mark-closed', {
          childPid: child.pid,
        });
      });

      writeCliSpawnTrace('spawn.and-wait.result', {
        childPid: child.pid,
        exitCode: result.exitCode,
        signal: result.signal,
        normalizedExitCode: getExitCode(result.exitCode, result.signal),
      });
      return getExitCode(result.exitCode, result.signal);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException | undefined)?.code;
      if (code === 'ENOENT') {
        throw ErrorFactory.createCliError(buildCommandNotFoundMessage(input.command));
      }

      throw ErrorFactory.createTryCatchError('Failed to spawn child process', error);
    } finally {
      delayedSignalForwarder.clear();
      process.off('SIGINT', onSigint);
      process.off('SIGTERM', onSigterm);
      writeCliSpawnTrace('spawn.signal.handlers.removed', {
        childPid: child.pid,
      });
    }
  },
});
