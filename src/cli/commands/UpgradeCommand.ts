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
        const cwd =
          typeof options.cwd === 'string' && options.cwd.trim() !== ''
            ? options.cwd
            : process.cwd();
        const envPath = path.resolve(cwd, '.env');

        const defaults = Object.freeze({
          HOST: 'localhost',
          PORT: '7777',
          LOG_LEVEL: 'debug',
        });

        // Ensure there is an env file to upgrade.
        if (options.dryRun === true) {
          // If missing, we'd create it.
          let exists = true;
          try {
            readFileSync(envPath, 'utf8');
          } catch {
            exists = false;
          }

          if (exists === false) {
            ErrorHandler.info(`[dry-run] Would create ${envPath}`);
          }

          // Run backfill logic on a temp in-memory basis by reading raw file.
          // For dry-run, we approximate by actually running logic only if file exists.
          if (exists) {
            const raw = readFileSync(envPath, 'utf8');
            // Use the real logic but against a throwaway file in memory is annoying; we keep it simple:
            // write a temp file next to it, then remove it.
            const tmpPath = `${envPath}.zin-upgrade.tmp`;
            writeFileSync(tmpPath, raw, 'utf8');
            const result = backfillEnvDefaults(tmpPath, defaults);
            if (result.changed === false) {
              ErrorHandler.success('No changes needed.');
            } else {
              ErrorHandler.info(
                `[dry-run] Would backfill .env: filled=${result.filledKeys.join(', ') || '(none)'}; appended=${
                  result.appendedKeys.join(', ') || '(none)'
                }`
              );
            }
            try {
              unlinkSync(tmpPath);
            } catch {
              // ignore
            }
          }

          return;
        }

        ensureEnvFileExists(envPath);
        const result = backfillEnvDefaults(envPath, defaults);

        if (result.changed === false) {
          ErrorHandler.success('No changes needed.');
          return;
        }

        ErrorHandler.success(
          `Upgraded .env: filled=${result.filledKeys.join(', ') || '(none)'}; appended=${
            result.appendedKeys.join(', ') || '(none)'
          }`
        );
      },
    });
  },
});

export default UpgradeCommand;
