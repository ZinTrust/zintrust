import { appConfig } from '@config/app';
import { ErrorFactory } from '@exceptions/ZintrustError';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

export interface SpawnAndWaitInput {
  command: string;
  args: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  forwardSignals?: boolean;
}

const getExitCode = (exitCode: number | null, signal: NodeJS.Signals | null): number => {
  if (typeof exitCode === 'number') return exitCode;
  if (signal === 'SIGINT' || signal === 'SIGTERM') return 0;
  return 1;
};

const resolveLocalBin = (command: string, cwd: string): string => {
  // If command is already a path, leave it alone.
  if (command.includes('/') || command.includes('\\')) return command;

  const binDir = path.join(cwd, 'node_modules', '.bin');
  const candidates =
    process.platform === 'win32'
      ? [
          path.join(binDir, `${command}.cmd`),
          path.join(binDir, `${command}.exe`),
          path.join(binDir, `${command}.bat`),
          path.join(binDir, command),
        ]
      : [path.join(binDir, command)];

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }

  return command;
};

export const SpawnUtil = Object.freeze({
  async spawnAndWait(input: SpawnAndWaitInput): Promise<number> {
    const cwd = input.cwd ?? process.cwd();
    const resolvedCommand = resolveLocalBin(input.command, cwd);

    const child = spawn(resolvedCommand, input.args, {
      cwd,
      env: input.env ?? appConfig.getSafeEnv(),
      stdio: 'inherit',
    });

    const forwardSignals = input.forwardSignals !== false;

    const forwardSignal = (signal: NodeJS.Signals): void => {
      try {
        child.kill(signal);
      } catch (error) {
        throw ErrorFactory.createTryCatchError('Failed to forward signal to child process', error);
      }
    };

    const onSigint = (): void => forwardSignal('SIGINT');
    const onSigterm = (): void => forwardSignal('SIGTERM');

    if (forwardSignals) {
      process.on('SIGINT', onSigint);
      process.on('SIGTERM', onSigterm);
    }

    try {
      const result = await new Promise<{ exitCode: number | null; signal: NodeJS.Signals | null }>(
        (resolve, reject) => {
          child.once('error', (error: unknown) => {
            reject(error);
          });

          child.once('close', (code: number | null, signal: NodeJS.Signals | null) => {
            resolve({ exitCode: code, signal });
          });
        }
      );

      return getExitCode(result.exitCode, result.signal);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException | undefined)?.code;
      if (code === 'ENOENT') {
        throw ErrorFactory.createCliError(`Error: '${input.command}' not found on PATH.`);
      }

      throw ErrorFactory.createTryCatchError('Failed to spawn child process', error);
    } finally {
      if (forwardSignals) {
        process.off('SIGINT', onSigint);
        process.off('SIGTERM', onSigterm);
      }
    }
  },
});
