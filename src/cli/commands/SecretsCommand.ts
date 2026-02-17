/**
 * Secrets Command
 *
 * CLI-first secrets sync using the core internal toolkit.
 *
 * Usage:
 *   zin secrets pull   --provider aws|cloudflare [--manifest secrets.manifest.json] [--out .env.pull] [--dry-run]
 *   zin secrets push   --provider aws|cloudflare [--manifest secrets.manifest.json] [--in .env] [--dry-run]
 *   zin secrets doctor --provider aws|cloudflare
 */

import { BaseCommand, type CommandOptions, type IBaseCommand } from '@cli/BaseCommand';
import { ErrorFactory } from '@exceptions/ZintrustError';
import { isArray } from '@helper/index';
import type { Command } from 'commander';

import { SecretsToolkit } from '@toolkit/Secrets';
import type { SecretsProviderName } from '@toolkit/Secrets/Manifest';

type SecretsCommandOptions = CommandOptions & {
  provider?: string;
  manifest?: string;
  out?: string;
  in?: string;
  dryRun?: boolean;
};

const getArg = (args: unknown, index: number): string | undefined => {
  if (!isArray(args)) return undefined;
  const v = args[index];
  return typeof v === 'string' ? v : undefined;
};

const coerceProvider = (provider: string | undefined): SecretsProviderName | undefined =>
  provider === 'aws' || provider === 'cloudflare' ? provider : undefined;

type ParsedSecretsArgs = {
  cwd: string;
  action: string;
  provider?: SecretsProviderName;
  manifestPath?: string;
  outFile?: string;
  inFile?: string;
  dryRun: boolean;
};

const parseOptions = (options: SecretsCommandOptions): ParsedSecretsArgs => {
  const cwd = process.cwd();
  const action = getArg(options.args, 0) ?? 'pull';

  const provider =
    typeof options.provider === 'string' ? coerceProvider(options.provider) : undefined;

  const manifestPath = typeof options.manifest === 'string' ? options.manifest : undefined;
  const outFile = typeof options.out === 'string' ? options.out : undefined;
  const inFile = typeof options.in === 'string' ? options.in : undefined;
  const dryRun = options.dryRun === true;

  return { cwd, action, provider, manifestPath, outFile, inFile, dryRun };
};

const addOptions = (command: Command): void => {
  command
    .argument('[action]', 'pull | push | doctor', 'pull')
    .option('--provider <provider>', 'aws | cloudflare')
    .option(
      '--manifest <path>',
      'Manifest path (default: secrets.manifest.json)',
      'secrets.manifest.json'
    )
    .option('--out <path>', 'Output env file for pull (default: .env.pull)', '.env.pull')
    .option('--in <path>', 'Input env file for push (default: .env)', '.env')
    .option('--dry-run', 'Do not write/upload, just show what would change');
};

const execute = async (cmd: IBaseCommand, options: SecretsCommandOptions): Promise<void> => {
  const parsed = parseOptions(options);

  switch (parsed.action) {
    case 'pull': {
      const result = await SecretsToolkit.pull({
        cwd: parsed.cwd,
        provider: parsed.provider,
        manifestPath: parsed.manifestPath,
        outFile: parsed.outFile,
        dryRun: parsed.dryRun,
      });

      cmd.success(
        `Pulled ${result.keys.length} keys to ${result.outFile}${parsed.dryRun ? ' (dry-run)' : ''}`
      );
      return;
    }

    case 'push': {
      const result = await SecretsToolkit.push({
        cwd: parsed.cwd,
        provider: parsed.provider,
        manifestPath: parsed.manifestPath,
        inFile: parsed.inFile,
        dryRun: parsed.dryRun,
      });

      cmd.success(
        `Pushed ${result.keys.length} keys from ${result.inFile}${parsed.dryRun ? ' (dry-run)' : ''}`
      );
      return;
    }

    case 'doctor': {
      const result = SecretsToolkit.doctor({ provider: parsed.provider });

      if (result.ok) {
        cmd.success(`Secrets doctor OK (${result.provider})`);
      } else {
        cmd.warn(
          `Secrets doctor failed (${result.provider}). Missing: ${result.missing.join(', ')}`
        );
      }

      return;
    }

    default:
      throw ErrorFactory.createCliError(`Unknown secrets action: ${parsed.action}`);
  }
};

export const SecretsCommand = Object.freeze({
  create(): IBaseCommand {
    const cmd: IBaseCommand = BaseCommand.create({
      name: 'secrets',
      description: 'Pull/push secrets to local .env.pull via core toolkit',
      addOptions,
      execute: async (options: CommandOptions): Promise<void> =>
        execute(cmd, options as SecretsCommandOptions),
    });

    return cmd;
  },
});

export default SecretsCommand;
