import type { CommandOptions, IBaseCommand } from '@cli/BaseCommand';
import { BaseCommand } from '@cli/BaseCommand';
import {
  resolveComposePath,
  runComposeWithFallback,
} from '@cli/commands/DockerComposeCommandUtils';
import { Logger } from '@config/logger';
import { ErrorFactory } from '@exceptions/ZintrustError';
import type { Command } from 'commander';

type ContainerProxiesAction = 'build' | 'up' | 'down';

type ContainerProxiesOptions = CommandOptions & {
  detach?: boolean;
  noCache?: boolean;
  pull?: boolean;
  build?: boolean;
  removeOrphans?: boolean;
  volumes?: boolean;
};

const runBuild = async (composePath: string, options: ContainerProxiesOptions): Promise<void> => {
  const args = ['compose', '-f', composePath, 'build'];

  if (options.noCache === true) {
    args.push('--no-cache');
  }

  if (options.pull === true) {
    args.push('--pull');
  }

  Logger.info('Building proxy stack image...');
  await runComposeWithFallback(args);
};

const runUp = async (composePath: string, options: ContainerProxiesOptions): Promise<void> => {
  const args = ['compose', '-f', composePath, 'up'];

  if (options.detach === true) {
    args.push('-d');
  }

  if (options.removeOrphans === true) {
    args.push('--remove-orphans');
  }

  Logger.info('Starting proxy stack...');
  await runComposeWithFallback(args);
};

const runDown = async (composePath: string, options: ContainerProxiesOptions): Promise<void> => {
  const args = ['compose', '-f', composePath, 'down'];

  if (options.removeOrphans === true) {
    args.push('--remove-orphans');
  }

  if (options.volumes === true) {
    args.push('--volumes');
  }

  Logger.info('Stopping proxy stack...');
  await runComposeWithFallback(args);
};

const normalizeAction = (raw?: string): ContainerProxiesAction => {
  const value = (raw ?? '').trim().toLowerCase();
  if (value === 'build' || value === 'up' || value === 'down') return value;
  throw ErrorFactory.createCliError('Usage: zin cp <build|up|down> [options]');
};

export const ContainerProxiesCommand = Object.freeze({
  create(): IBaseCommand {
    return BaseCommand.create({
      name: 'cp',
      aliases: ['container-proxies'],
      description: 'Build, start, or stop container-based proxy stack',
      addOptions: (command: Command): void => {
        command.argument('<action>', 'Action to run (build, up, down)');
        command.option('-d, --detach', 'Run containers in background (up only)');
        command.option('--no-cache', 'Disable Docker build cache (build only)');
        command.option('--pull', 'Always attempt to pull a newer base image (build only)');
        command.option('--build', 'Build before running up (up only)');
        command.option('--remove-orphans', 'Remove containers for services not defined in compose');
        command.option('--volumes', 'Remove named volumes when running down (down only)');
      },
      execute: async (options: ContainerProxiesOptions): Promise<void> => {
        const action = normalizeAction(options.args?.[0]);
        const composePath = resolveComposePath(
          'docker-compose.proxy.yml',
          'docker-compose.proxy.yml not found.'
        );

        if (action === 'build') {
          await runBuild(composePath, options);
          return;
        }

        if (action === 'down') {
          await runDown(composePath, options);
          return;
        }

        if (options.build === true) {
          await runBuild(composePath, options);
        }

        await runUp(composePath, options);
      },
    });
  },
});
