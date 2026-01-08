/**
 * Upgrade Command
 *
 * Goal: help existing Zintrust projects adopt new safe defaults without forcing
 * a full re-scaffold.
 *
 * Current scope (minimal/safe):
 * - Backfill required .env defaults (HOST, PORT, LOG_LEVEL) when missing or blank.
 * - Never overwrite a non-empty user value.
 */

import { BaseCommand, type CommandOptions, type IBaseCommand } from '@cli/BaseCommand';
import { ErrorHandler } from '@cli/ErrorHandler';
import { type EnvBackfillResult, EnvFileBackfill } from '@cli/env/EnvFileBackfill';
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from '@node-singletons/fs';
import * as path from '@node-singletons/path';
import { Command } from 'commander';

type UpgradeCommandOptions = CommandOptions & {
  cwd?: string;
  dryRun?: boolean;
};

const ensureEnvFileExists = (envPath: string): void => {
  const dir = path.dirname(envPath);
  mkdirSync(dir, { recursive: true });
  try {
    readFileSync(envPath, 'utf8');
  } catch {
    writeFileSync(envPath, '\n', 'utf8');
  }
};

const resolveCwd = (cwd?: string): string => {
  if (typeof cwd === 'string' && cwd.trim() !== '') return cwd;
  return process.cwd();
};

const getEnvDefaults = (): Record<string, string> =>
  Object.freeze({
    HOST: 'localhost',
    PORT: '7777',
    LOG_LEVEL: 'debug',
  });

const envFileExists = (envPath: string): boolean => {
  try {
    readFileSync(envPath, 'utf8');
    return true;
  } catch {
    return false;
  }
};

const formatBackfillSummary = (result: EnvBackfillResult): string => {
  const filled = result.filledKeys.join(', ') || '(none)';
  const appended = result.appendedKeys.join(', ') || '(none)';
  return `filled=${filled}; appended=${appended}`;
};

const runDryRun = (envPath: string, defaults: Record<string, string>): void => {
  const exists = envFileExists(envPath);

  if (exists === false) {
    ErrorHandler.info(`[dry-run] Would create ${envPath}`);
    return;
  }

  const raw = readFileSync(envPath, 'utf8');
  const tmpPath = `${envPath}.zin-upgrade.tmp`;

  writeFileSync(tmpPath, raw, 'utf8');
  try {
    const result = EnvFileBackfill.backfillEnvDefaults(tmpPath, defaults);

    if (result.changed === false) {
      ErrorHandler.success('No changes needed.');
      return;
    }

    ErrorHandler.info(`[dry-run] Would backfill .env: ${formatBackfillSummary(result)}`);
  } finally {
    try {
      unlinkSync(tmpPath);
    } catch {
      // ignore
    }
  }
};

const runUpgrade = (envPath: string, defaults: Record<string, string>): EnvBackfillResult => {
  ensureEnvFileExists(envPath);
  return EnvFileBackfill.backfillEnvDefaults(envPath, defaults);
};

export const UpgradeCommand = Object.freeze({
  create(): IBaseCommand {
    return BaseCommand.create({
      name: 'upgrade',
      description: 'Upgrade an existing Zintrust project in-place (safe, non-destructive)',
      addOptions: (command: Command) => {
        command.option('--cwd <path>', 'Project directory (default: current working directory)');
        command.option('--dry-run', 'Print planned changes without writing files');
      },
      execute: (options: UpgradeCommandOptions): void => {
        const cwd = resolveCwd(options.cwd);
        const envPath = path.resolve(cwd, '.env');
        const defaults = getEnvDefaults();

        if (options.dryRun === true) {
          runDryRun(envPath, defaults);
          return;
        }

        const result = runUpgrade(envPath, defaults);

        if (result.changed === false) {
          ErrorHandler.success('No changes needed.');
          return;
        }

        ErrorHandler.success(`Upgraded .env: ${formatBackfillSummary(result)}`);
      },
    });
  },
});

export default UpgradeCommand;
