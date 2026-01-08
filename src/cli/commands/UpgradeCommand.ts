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
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from '@node-singletons/fs';
import * as path from '@node-singletons/path';
import { Command } from 'commander';

type UpgradeCommandOptions = CommandOptions & {
  cwd?: string;
  dryRun?: boolean;
};

const stripEnvInlineComment = (value: string): string => {
  let inSingle = false;
  let inDouble = false;

  for (let i = 0; i < value.length; i += 1) {
    const ch = value[i];
    if (ch === "'" && !inDouble) inSingle = !inSingle;
    if (ch === '"' && !inSingle) inDouble = !inDouble;

    if (!inSingle && !inDouble && ch === '#') {
      const prev = value[i - 1];
      if (prev === undefined || prev === ' ' || prev === '\t') {
        return value.slice(0, i).trimEnd();
      }
    }
  }

  return value;
};

type EnvBackfillResult = {
  changed: boolean;
  filledKeys: string[];
  appendedKeys: string[];
};

const backfillEnvDefaults = (
  envPath: string,
  defaults: Record<string, string>
): EnvBackfillResult => {
  const raw = readFileSync(envPath, 'utf8');
  const lines = raw.split(/\r?\n/);

  const seen = new Set<string>();
  const filledKeys: string[] = [];
  const appendedKeys: string[] = [];

  const out = lines.map((line) => {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) return line;

    const withoutExport = trimmed.startsWith('export ') ? trimmed.slice('export '.length) : trimmed;
    const eq = withoutExport.indexOf('=');
    if (eq <= 0) return line;

    const key = withoutExport.slice(0, eq).trim();
    if (key === '') return line;
    if (!Object.hasOwn(defaults, key)) return line;
    if (seen.has(key)) return line;
    seen.add(key);

    const rhs = withoutExport.slice(eq + 1);
    const withoutComment = stripEnvInlineComment(rhs);
    const value = withoutComment.trim();

    if (value !== '') return line;

    filledKeys.push(key);
    return `${key}=${defaults[key]}`;
  });

  const missingKeys = Object.keys(defaults).filter((k) => !seen.has(k));
  if (missingKeys.length > 0) {
    appendedKeys.push(...missingKeys);
    out.push(...missingKeys.map((k) => `${k}=${defaults[k]}`));
  }

  const changed = filledKeys.length > 0 || appendedKeys.length > 0;
  if (!changed) return { changed: false, filledKeys, appendedKeys };

  writeFileSync(envPath, out.join('\n') + (out.at(-1) === '' ? '' : '\n'));
  return { changed: true, filledKeys, appendedKeys };
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
    const result = backfillEnvDefaults(tmpPath, defaults);

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
  return backfillEnvDefaults(envPath, defaults);
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
