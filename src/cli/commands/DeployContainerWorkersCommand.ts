import type { CommandOptions, IBaseCommand } from '@cli/BaseCommand';
import { BaseCommand } from '@cli/BaseCommand';
import { SpawnUtil } from '@cli/utils/spawn';
import { Logger } from '@config/logger';
import { ErrorFactory } from '@exceptions/ZintrustError';
import { existsSync } from '@node-singletons/fs';
import { join } from '@node-singletons/path';
import type { Command } from 'commander';

type DeployCwOptions = CommandOptions & {
  noBuild?: boolean;
  removeOrphans?: boolean;
};

const resolveComposePath = (): string => {
  const composePath = join(process.cwd(), 'docker-compose.workers.yml');
  if (!existsSync(composePath)) {
    throw ErrorFactory.createCliError(
      'docker-compose.workers.yml not found. Run `zin init:cw` first.'
    );
  }
  return composePath;
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

export const DeployContainerWorkersCommand = Object.freeze({
  create(): IBaseCommand {
    return BaseCommand.create({
      name: 'deploy:cw',
      aliases: ['deploy:container-workers'],
      description: 'Deploy Container Workers stack (docker-compose.workers.yml)',
      addOptions: (command: Command): void => {
        command.option('--no-build', 'Skip image build before up');
        command.option('--remove-orphans', 'Remove containers for services not defined in compose');
      },
      execute: async (options: DeployCwOptions): Promise<void> => {
        const composePath = resolveComposePath();

        const args = ['compose', '-f', composePath, 'up', '-d'];
        if (options.noBuild !== true) args.push('--build');
        if (options.removeOrphans === true) args.push('--remove-orphans');

        Logger.info('Deploying container workers stack...');
        await runCompose(args);
        Logger.info('✅ Container workers deployed.');
      },
    });
  },
});
