import type { CommandOptions, IBaseCommand } from '@cli/BaseCommand';
import { BaseCommand } from '@cli/BaseCommand';
import {
  reportCloudflareSecretSync,
  syncCloudflareSecrets,
} from '@cli/cloudflare/CloudflareSecretSync';
import { SpawnUtil } from '@cli/utils/spawn';
import { Logger } from '@config/logger';
import { ErrorFactory } from '@exceptions/ZintrustError';
import { existsSync } from '@node-singletons/fs';
import { join } from '@node-singletons/path';
import type { Command } from 'commander';

type DeployContainersProxyOptions = CommandOptions & {
  env?: string;
  config?: string;
  envPath?: string;
  target?: string;
  syncSecrets?: boolean;
};

const DEFAULT_CONFIG = 'wrangler.containers-proxy.jsonc';

const resolveConfig = (cwd: string, raw: string | undefined): string => {
  const normalized = typeof raw === 'string' ? raw.trim() : '';
  const candidate = normalized.length > 0 ? normalized : DEFAULT_CONFIG;
  const full = join(cwd, candidate);
  if (existsSync(full)) return candidate;
  throw ErrorFactory.createCliError(`Wrangler config not found: ${candidate}`);
};

const resolveEnv = (raw: string | undefined): string => {
  const normalized = typeof raw === 'string' ? raw.trim() : '';
  return normalized.length > 0 ? normalized : 'production';
};

const syncDeploySecrets = async (
  cmd: IBaseCommand,
  cwd: string,
  config: string,
  env: string,
  options: DeployContainersProxyOptions
): Promise<void> => {
  if (options.syncSecrets === false) return;

  const result = await syncCloudflareSecrets({
    log: cmd,
    cwd,
    wranglerEnvs: [env],
    envPath:
      typeof options.envPath === 'string' && options.envPath.trim() !== ''
        ? options.envPath
        : '.env',
    configPath: config,
    target: typeof options.target === 'string' ? options.target : undefined,
    requireSelection: false,
  });

  if (result.selectedKeys.length === 0) return;
  reportCloudflareSecretSync(cmd, result);
};

const execute = async (cmd: IBaseCommand, options: DeployContainersProxyOptions): Promise<void> => {
  const cwd = process.cwd();
  const config = resolveConfig(cwd, options.config);
  const env = resolveEnv(options.env);

  Logger.info(`Deploying Containers proxy via Wrangler (env=${env})...`);
  await syncDeploySecrets(cmd, cwd, config, env, options);
  const exitCode = await SpawnUtil.spawnAndWait({
    command: 'wrangler',
    args: ['deploy', '--config', config, '--env', env],
    env: process.env,
  });
  process.exit(exitCode);
};

export const DeployContainersProxyCommand = Object.freeze({
  create(): IBaseCommand {
    const cmd = BaseCommand.create({
      name: 'deploy:ccp',
      aliases: ['deploy:containers-proxy', 'deploy:cf-containers-proxy', 'd:ccp', 'ccp:deploy'],
      description: 'Deploy Cloudflare Containers proxy Worker (wrangler.containers-proxy.jsonc)',
      addOptions: (command: Command): void => {
        command.option('-e, --env <name>', 'Wrangler environment name', 'production');
        command.option('-c, --config <path>', 'Wrangler config file', DEFAULT_CONFIG);
        command.option(
          '--env-path <path>',
          'Path to env file used when syncing Cloudflare secrets',
          '.env'
        );
        command.option(
          '--target <id>',
          'Cloudflare worker target key from .zintrust.json cloudflare.targets'
        );
        command.option('--no-sync-secrets', 'Skip Cloudflare secret sync before wrangler deploy');
      },
      execute: async (options: CommandOptions): Promise<void> =>
        execute(cmd, options as DeployContainersProxyOptions),
    });

    return cmd;
  },
});
