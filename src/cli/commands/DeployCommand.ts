/**
 * Deploy Command - Deploy ZinTrust to Cloudflare Workers
 * Handles deployment of workers and proxies
 */
import type { CommandOptions, IBaseCommand } from '@cli/BaseCommand';
import { BaseCommand } from '@cli/BaseCommand';
import { SpawnUtil } from '@cli/utils/spawn';
import { Logger } from '@config/logger';
import type { Command } from 'commander';

type DeployCommandOptions = CommandOptions & {
  env?: string;
};

const runDeploy = async (target: string, options: DeployCommandOptions): Promise<void> => {
  const environment = options.env ?? target ?? 'worker';

  Logger.info(`Deploying to Cloudflare environment: ${environment}`);

  const exitCode = await SpawnUtil.spawnAndWait({
    command: 'wrangler',
    args: ['deploy', '--env', environment],
  });

  if (exitCode !== 0) {
    process.exit(exitCode);
  }
};

const createDeployCommand = (): IBaseCommand => {
  return BaseCommand.create({
    name: 'deploy',
    description: 'Deploy ZinTrust to Cloudflare Workers',
    addOptions: (command: Command) => {
      command
        .argument(
          '[target]',
          'Deployment target (worker, d1-proxy, kv-proxy, production)',
          'worker'
        )
        .option('-e, --env <env>', 'Wrangler environment (overrides target)');
    },
    execute: async (options: DeployCommandOptions): Promise<void> => {
      // Note: BaseCommand.create sets up action handler that calls execute(options).
      // However, since we define arguments '[target]', commander passes them to the action callback
      // BEFORE the options object.
      //
      // The BaseCommand.create generic action handler:
      // command.action(async (...args: unknown[]) => {
      //   const options = args.at(-2) as CommandOptions;
      //   const commandArgs = args.slice(0, -2) as string[];
      //   options.args = commandArgs;
      //   await config.execute(options);
      // });
      //
      // So 'target' will be available in options.args[0]

      const target = options.args?.[0] ?? 'worker';
      await runDeploy(target, options);
    },
  });
};

/**
 * Deploy Command Factory
 * Sealed namespace for immutability
 */
export const DeployCommand = Object.freeze({
  /**
   * Create a deploy command instance
   */
  create(): IBaseCommand {
    return createDeployCommand();
  },
});
