import { BaseCommand, type CommandOptions, type IBaseCommand } from '@cli/BaseCommand';
import {
  reportCloudflareSecretSync,
  syncCloudflareSecrets,
  uniq,
} from '@cli/cloudflare/CloudflareSecretSync';
import { ErrorFactory } from '@exceptions/ZintrustError';
import type { Command } from 'commander';

type PutCommandOptions = CommandOptions & {
  wg?: string[] | string;
  var?: string[] | string;
  key?: string[] | string;
  keys?: string[] | string;
  value?: string;
  target?: string;
  env_path?: string;
  dryRun?: boolean;
  config?: string;
  bulk?: boolean;
};

const toStringArray = (value: unknown): string[] => {
  if (typeof value === 'string') return [value];
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string');
};

const resolveConfigGroups = (options: PutCommandOptions): string[] => {
  return uniq(toStringArray(options.var));
};

const resolveDirectKeys = (options: PutCommandOptions): string[] => {
  return uniq([...toStringArray(options.key), ...toStringArray(options.keys)]);
};

const resolveInlineValues = (options: PutCommandOptions): Record<string, string> => {
  if (typeof options.value !== 'string') return {};

  const directKeys = resolveDirectKeys(options);
  if (directKeys.length === 0) {
    throw ErrorFactory.createCliError('`--value` requires `--key` or `--keys`.');
  }

  if (directKeys.length !== 1) {
    throw ErrorFactory.createCliError('`--value` supports exactly one selected key.');
  }

  return { [directKeys[0]]: options.value };
};

const resolveWranglerEnvs = (options: PutCommandOptions): string[] => {
  const requested = uniq(toStringArray(options.wg));
  if (requested.length === 0) return [''];
  return requested;
};

const parseEnvPath = (options: PutCommandOptions): string => {
  const direct = options['env_path'];
  if (typeof direct === 'string' && direct.trim() !== '') return direct;
  return '.env';
};

const addOptions = (command: Command): void => {
  command
    .argument('[provider]', 'Secret provider (cloudflare)', 'cloudflare')
    .option('--wg <env...>', 'Wrangler environment target(s), e.g. d1-proxy kv-proxy')
    .option('--var <configKey...>', 'Config array key(s) from .zintrust.json (e.g. d1_env kv_env)')
    .option('--key <name...>', 'Upload selected secret key(s) directly without group expansion')
    .option(
      '--keys <name...>',
      'Upload selected secret key(s) from env source without group expansion'
    )
    .option('--value <value>', 'Inline value for a single `--key` upload')
    .option('--target <id>', 'Cloudflare worker target key from .zintrust.json cloudflare.targets')
    .option('--env_path <path>', 'Path to env file used as source values', '.env')
    .option('-c, --config <path>', 'Wrangler config file to target (optional)')
    .option('--bulk', 'Upload the final key set with one wrangler secret bulk call per target')
    .option('--dry-run', 'Show what would be uploaded without calling wrangler');
};

const ensureCloudflareProvider = (providerRaw: string): void => {
  if (providerRaw.toLowerCase() === 'cloudflare') return;
  throw ErrorFactory.createCliError('Only cloudflare provider is supported for `zin put`');
};

const execute = async (cmd: IBaseCommand, options: PutCommandOptions): Promise<void> => {
  ensureCloudflareProvider(String(options.args?.[0] ?? 'cloudflare'));

  const cwd = process.cwd();
  const directKeys = resolveDirectKeys(options);
  const inlineValues = resolveInlineValues(options);
  const result = await syncCloudflareSecrets({
    log: cmd,
    cwd,
    wranglerEnvs: resolveWranglerEnvs(options),
    envPath: parseEnvPath(options),
    dryRun: options.dryRun === true,
    configGroups: resolveConfigGroups(options),
    directKeys,
    inlineValues,
    configPath: typeof options.config === 'string' ? options.config.trim() : undefined,
    target: typeof options.target === 'string' ? options.target : undefined,
    bulk: options.bulk === true,
    requireSelection: true,
  });
  reportCloudflareSecretSync(cmd, result);
};

export const PutCommand = Object.freeze({
  create(): IBaseCommand {
    const cmd: IBaseCommand = BaseCommand.create({
      name: 'put',
      description: 'Put secrets to Cloudflare with dynamic groups from .zintrust.json',
      addOptions,
      execute: async (options: CommandOptions): Promise<void> =>
        execute(cmd, options as PutCommandOptions),
    });

    return cmd;
  },
});

export default PutCommand;
