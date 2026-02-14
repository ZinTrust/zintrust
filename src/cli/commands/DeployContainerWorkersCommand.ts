import type { CommandOptions, IBaseCommand } from '@cli/BaseCommand';
import { BaseCommand } from '@cli/BaseCommand';
import {
  resolveComposePath,
  runComposeWithFallback,
} from '@cli/commands/DockerComposeCommandUtils';
import { Logger } from '@config/logger';
import type { Command } from 'commander';

type DeployCwOptions = CommandOptions & {
  noBuild?: boolean;
  removeOrphans?: boolean;
};

export const DeployContainerWorkersCommand = Object.freeze({
  create(): IBaseCommand {
    return BaseCommand.create({
      name: 'deploy:cw',
      aliases: ['deploy:container-workers', 'deploy:cwr', 'deploy:container-workers-routes'],
      description: 'Deploy Container Workers stack (docker-compose.workers.yml)',
      addOptions: (command: Command): void => {
        command.option('--no-build', 'Skip image build before up');
        command.option('--remove-orphans', 'Remove containers for services not defined in compose');
      },
      execute: async (options: DeployCwOptions): Promise<void> => {
        const composePath = resolveComposePath(
          'docker-compose.workers.yml',
          'docker-compose.workers.yml not found. Run `zin init:cw` first.'
        );

        const args = ['compose', '-f', composePath, 'up', '-d'];
        if (options.noBuild !== true) args.push('--build');
        if (options.removeOrphans === true) args.push('--remove-orphans');

        Logger.info('Deploying container workers stack...');
        await runComposeWithFallback(args);
        Logger.info('✅ Container workers deployed.');
      },
    });
  },
});
