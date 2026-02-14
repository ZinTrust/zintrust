import type { CommandOptions, IBaseCommand } from '@cli/BaseCommand';
import { BaseCommand } from '@cli/BaseCommand';
import {
  resolveComposePath,
  runComposeWithFallback,
} from '@cli/commands/DockerComposeCommandUtils';
import { Logger } from '@config/logger';
import type { Command } from 'commander';

type DeployCpOptions = CommandOptions & {
  noBuild?: boolean;
  removeOrphans?: boolean;
};

export const DeployContainerProxiesCommand = Object.freeze({
  create(): IBaseCommand {
    return BaseCommand.create({
      name: 'deploy:cp',
      aliases: ['deploy:container-proxies', 'deploy:proxy-stack'],
      description: 'Deploy proxy stack (docker-compose.proxy.yml)',
      addOptions: (command: Command): void => {
        command.option('--no-build', 'Skip image build before up');
        command.option('--remove-orphans', 'Remove containers for services not defined in compose');
      },
      execute: async (options: DeployCpOptions): Promise<void> => {
        const composePath = resolveComposePath(
          'docker-compose.proxy.yml',
          'docker-compose.proxy.yml not found.'
        );

        const args = ['compose', '-f', composePath, 'up', '-d'];
        if (options.noBuild !== true) args.push('--build');
        if (options.removeOrphans === true) args.push('--remove-orphans');

        Logger.info('Deploying proxy stack...');
        await runComposeWithFallback(args);
        Logger.info('✅ Proxy stack deployed.');
      },
    });
  },
});
