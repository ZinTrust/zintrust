import type { CommandOptions, IBaseCommand } from '@cli/BaseCommand';
import { BaseCommand } from '@cli/BaseCommand';
import { SpawnUtil } from '@cli/utils/spawn';
import { Logger } from '@config/logger';
import { ErrorFactory } from '@exceptions/ZintrustError';
import { existsSync } from '@node-singletons/fs';
import { join } from '@node-singletons/path';
import type { Command } from 'commander';

type DeployContainersProxyOptions = CommandOptions & {
  env?: string;
  config?: string;
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

const execute = async (options: DeployContainersProxyOptions): Promise<void> => {
  const cwd = process.cwd();
  const config = resolveConfig(cwd, options.config);
  const env = resolveEnv(options.env);

  Logger.info(`Deploying Containers proxy via Wrangler (env=${env})...`);
  const exitCode = await SpawnUtil.spawnAndWait({
    command: 'wrangler',
    args: ['deploy', '--config', config, '--env', env],
    env: process.env,
  });
  process.exit(exitCode);
};

export const DeployContainersProxyCommand = Object.freeze({
  create(): IBaseCommand {
    return BaseCommand.create({
      name: 'deploy:ccp',
      aliases: ['deploy:containers-proxy', 'deploy:cf-containers-proxy', 'd:ccp', 'ccp:deploy'],
      description: 'Deploy Cloudflare Containers proxy Worker (wrangler.containers-proxy.jsonc)',
      addOptions: (command: Command): void => {
        command.option('-e, --env <name>', 'Wrangler environment name', 'production');
        command.option('-c, --config <path>', 'Wrangler config file', DEFAULT_CONFIG);
      },
      execute: async (options: CommandOptions): Promise<void> =>
        execute(options as DeployContainersProxyOptions),
    });
  },
});
