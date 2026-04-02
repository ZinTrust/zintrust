import { BaseCommand, type CommandOptions, type IBaseCommand } from '@cli/BaseCommand';
import { materializeWranglerDevVars } from '@cli/cloudflare/CloudflareWranglerDevEnv';
import type { Command } from 'commander';

type WranglerDevVarsCommandOptions = CommandOptions & {
  env?: string;
  envPath?: string;
  target?: string;
  config?: string;
};

const optionalTrimmed = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
};

const addOptions = (command: Command): void => {
  command
    .option('--env <name>', 'Wrangler environment name used for .dev.vars.<env> output')
    .option(
      '--env-path <path>',
      'Env file used as source values for generated Wrangler dev vars',
      '.env'
    )
    .option('--target <id>', 'Cloudflare worker target key from .zintrust.json cloudflare.targets')
    .option('-c, --config <path>', 'Wrangler config file used for target inference (optional)');
};

const execute = async (
  cmd: IBaseCommand,
  options: WranglerDevVarsCommandOptions
): Promise<void> => {
  const result = await materializeWranglerDevVars({
    cwd: process.cwd(),
    projectRoot: process.cwd(),
    ...(optionalTrimmed(options.env) === undefined
      ? {}
      : { envName: optionalTrimmed(options.env) }),
    ...(optionalTrimmed(options.envPath) === undefined
      ? {}
      : { envPath: optionalTrimmed(options.envPath) }),
    ...(optionalTrimmed(options.target) === undefined
      ? {}
      : { target: optionalTrimmed(options.target) }),
    ...(optionalTrimmed(options.config) === undefined
      ? {}
      : { configPath: optionalTrimmed(options.config) }),
    requireSelection: true,
  });

  cmd.success(`Wrangler dev vars prepared at ${result.filePath}`);
  cmd.info(`Selected keys: ${result.selectedKeys.length}`);

  if (result.missingKeys.length > 0) {
    cmd.warn(`Missing keys: ${result.missingKeys.join(', ')}`);
  }
};

export const WranglerDevVarsCommand = Object.freeze({
  create(): IBaseCommand {
    const cmd: IBaseCommand = BaseCommand.create({
      name: 'wrangler:dev-vars',
      description: 'Generate manifest-scoped Wrangler .dev.vars files for local Worker development',
      aliases: ['cloudflare:dev-vars'],
      addOptions,
      execute: async (options: CommandOptions): Promise<void> =>
        execute(cmd, options as WranglerDevVarsCommandOptions),
    });

    return cmd;
  },
});

export default WranglerDevVarsCommand;
