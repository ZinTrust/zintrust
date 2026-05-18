import { BaseCommand, type CommandOptions, type IBaseCommand } from '@cli/BaseCommand';
import {
  reportCloudflareSecretSync,
  syncCloudflareSecrets,
} from '@cli/cloudflare/CloudflareSecretSync';
import { ErrorFactory } from '@exceptions/ZintrustError';
import type { Command } from 'commander';

type PutCommandOptions = CommandOptions & {
  wg?: string[] | string;
  var?: string[] | string;
  target?: string;
  env_path?: string;
  dryRun?: boolean;
  config?: string;
};

const toStringArray = (value: unknown): string[] => {
  if (typeof value === 'string') return [value];
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string');
};

const uniq = (items: string[]): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const normalized = item.trim();
    if (normalized === '' || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
};

const resolveConfigGroups = (options: PutCommandOptions): string[] => {
  return uniq(toStringArray(options.var));
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
    .option('--target <id>', 'Cloudflare worker target key from .zintrust.json cloudflare.targets')
    .option('--env_path <path>', 'Path to env file used as source values', '.env')
    .option('-c, --config <path>', 'Wrangler config file to target (optional)')
    .option('--dry-run', 'Show what would be uploaded without calling wrangler');
};

const ensureCloudflareProvider = (providerRaw: string): void => {
  if (providerRaw.toLowerCase() === 'cloudflare') return;
  throw ErrorFactory.createCliError('Only cloudflare provider is supported for `zin put`');
};

const execute = async (cmd: IBaseCommand, options: PutCommandOptions): Promise<void> => {
  ensureCloudflareProvider(String(options.args?.[0] ?? 'cloudflare'));

  const cwd = process.cwd();
  const result = await syncCloudflareSecrets({
    log: cmd,
    cwd,
    wranglerEnvs: resolveWranglerEnvs(options),
    envPath: parseEnvPath(options),
    dryRun: options.dryRun === true,
    configGroups: resolveConfigGroups(options),
    configPath: typeof options.config === 'string' ? options.config.trim() : undefined,
    target: typeof options.target === 'string' ? options.target : undefined,
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
