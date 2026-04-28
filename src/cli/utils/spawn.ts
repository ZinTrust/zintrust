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

      const finish = (result: { exitCode: number | null; signal: NodeJS.Signals | null }): void => {
        if (settled) return;
        settled = true;
        child.off?.('exit', onExitEvent);
        child.off?.('close', onCloseEvent);
        onExit();
        resolve(result);
      };

      const onExitEvent = (code: number | null, signal: NodeJS.Signals | null): void => {
        finish({ exitCode: code, signal });
      };

      const onCloseEvent = (code: number | null, signal: NodeJS.Signals | null): void => {
        finish({ exitCode: code, signal });
      };

      child.once('error', (error: unknown) => {
        reject(error);
      });

      child.once('exit', onExitEvent);
      child.once('close', onCloseEvent);
    }
  );
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

  const clear = (): void => {
    if (delayedSignalTimer === undefined) return;
    clearTimeout(delayedSignalTimer);
    delayedSignalTimer = undefined;
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
        input.forwardSignal(signal);
      } catch {
        // best-effort fallback for interactive watch processes
      }
    }, input.ttySignalForwardDelayMs);

    (delayedSignalTimer as unknown as { unref?: () => void }).unref?.();
  };

  return { clear, schedule };
};

export const SpawnUtil = Object.freeze({
  async spawnAndWait(input: SpawnAndWaitInput): Promise<number> {
    const cwd = input.cwd ?? process.cwd();
    const resolvedCommand =
      input.shell === true ? input.command : resolveLocalBin(input.command, cwd);

    const child = spawn(resolvedCommand, input.args, {
      cwd,
      env: input.env ?? appConfig.getSafeEnv(),
      stdio: 'inherit',
      shell: input.shell === true,
    });

    // In interactive shells, the foreground process group already receives SIGINT
    // (and often SIGTERM) so forwarding can cause duplicates. `tsx watch` is
    // especially sensitive here and can print "Previous process hasn't exited yet. Force killing...".
    const forwardSignals =
      typeof input.forwardSignals === 'boolean' ? input.forwardSignals : !process.stdin.isTTY;
    const ttySignalForwardDelayMs =
      process.stdin.isTTY === true && forwardSignals === false
        ? Math.max(0, input.ttySignalForwardDelayMs ?? 0)
        : 0;
    let childClosed = false;

    const forwardSignal = (signal: NodeJS.Signals): void => {
      try {
        child.kill(signal);
      } catch (error) {
        const wrapped = ErrorFactory.createTryCatchError(
          'Failed to forward signal to child process',
          error
        );

        // Best-effort logging; then rethrow (tests/assertions rely on this behavior).
        try {
          process.stderr.write(`${String(wrapped.message)}\n`);
        } catch {
          // ignore
        }

        throw wrapped;
      }
    };
    const delayedSignalForwarder = createDelayedSignalForwarder({
      ttySignalForwardDelayMs,
      isChildClosed: () => childClosed,
      forwardSignal,
    });

    const onSigint = (): void => {
      if (forwardSignals) {
        forwardSignal('SIGINT');
        return;
      }

      // In interactive TTY mode, let the child receive the terminal SIGINT directly first.
      // If it is still alive after a short grace period, send one fallback signal so the
      // watcher exits without requiring a second Ctrl+C from the user.
      delayedSignalForwarder.schedule('SIGINT');
    };
    const onSigterm = (): void => {
      if (forwardSignals) {
        forwardSignal('SIGTERM');
        return;
      }

      delayedSignalForwarder.schedule('SIGTERM');
    };

    process.on('SIGINT', onSigint);
    process.on('SIGTERM', onSigterm);

    try {
      const result = await waitForChildExit(child, () => {
        childClosed = true;
        delayedSignalForwarder.clear();
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
    }
  },
});
