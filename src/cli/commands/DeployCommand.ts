/**
 * Deploy Command - Deploy ZinTrust to Cloudflare Workers
 * Handles deployment of workers and proxies
 */
import type { CommandOptions, IBaseCommand } from '@cli/BaseCommand';
import { BaseCommand } from '@cli/BaseCommand';
import { SpawnUtil } from '@cli/utils/spawn';
import { Logger } from '@config/logger';
import { ErrorFactory } from '@exceptions/ZintrustError';
import { existsSync } from '@node-singletons/fs';
import { join } from '@node-singletons/path';
import type { Command } from 'commander';

type DeployCommandOptions = CommandOptions & {
  env?: string;
};

const runCompose = async (args: string[]): Promise<void> => {
  try {
    const exitCode = await SpawnUtil.spawnAndWait({ command: 'docker', args });
    if (exitCode !== 0) process.exit(exitCode);
    return;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("'docker' not found")) throw error;
  }

  Logger.warn("'docker' not found. Falling back to 'docker-compose'.");
  const exitCode = await SpawnUtil.spawnAndWait({
    command: 'docker-compose',
    args: args.slice(1),
  });
  if (exitCode !== 0) process.exit(exitCode);
};

const deployContainerStack = async (
  composeFile: 'docker-compose.workers.yml' | 'docker-compose.workers-routes.yml',
  label: string
): Promise<void> => {
  const composePath = join(process.cwd(), composeFile);
  if (!existsSync(composePath)) {
    throw ErrorFactory.createCliError(`${composeFile} not found. Run \
\`zin init:${composeFile.includes('routes') ? 'cwr' : 'cw'}\` first.`);
  }

  Logger.info(`Deploying ${label}...`);
  await runCompose(['compose', '-f', composePath, 'up', '-d', '--build']);
  Logger.info(`✅ ${label} deployed.`);
};

const runDeploy = async (target: string, options: DeployCommandOptions): Promise<void> => {
  const normalizedTarget = target.trim().toLowerCase();

  if (normalizedTarget === 'cw') {
    await deployContainerStack('docker-compose.workers.yml', 'container workers stack');
    return;
  }

  if (normalizedTarget === 'cwr') {
    await deployContainerStack(
      'docker-compose.workers-routes.yml',
      'container workers routes stack'
    );
    return;
  }

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
          'Deployment target (worker, d1-proxy, kv-proxy, production, cw, cwr)',
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
