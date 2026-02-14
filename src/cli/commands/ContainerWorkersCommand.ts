import type { CommandOptions, IBaseCommand } from '@cli/BaseCommand';
import { BaseCommand } from '@cli/BaseCommand';
import {
  resolveComposePath,
  runComposeWithFallback,
} from '@cli/commands/DockerComposeCommandUtils';
import { Logger } from '@config/logger';
import { ErrorFactory } from '@exceptions/ZintrustError';
import type { Command } from 'commander';

type ContainerWorkersAction = 'build' | 'up';

type ContainerWorkersOptions = CommandOptions & {
  detach?: boolean;
  noCache?: boolean;
  pull?: boolean;
  build?: boolean;
};

const runBuild = async (composePath: string, options: ContainerWorkersOptions): Promise<void> => {
  const args = ['compose', '-f', composePath, 'build'];

  if (options.noCache === true) {
    args.push('--no-cache');
  }

  if (options.pull === true) {
    args.push('--pull');
  }

  Logger.info('Building container workers image...');
  await runComposeWithFallback(args);
};

const runUp = async (composePath: string, options: ContainerWorkersOptions): Promise<void> => {
  const args = ['compose', '-f', composePath, 'up'];

  if (options.detach === true) {
    args.push('-d');
  }

  Logger.info('Starting container workers...');
  await runComposeWithFallback(args);
};

const normalizeAction = (raw?: string): ContainerWorkersAction => {
  const value = (raw ?? '').trim().toLowerCase();
  if (value === 'build' || value === 'up') return value;
  throw ErrorFactory.createCliError('Usage: zin cw <build|up> [options]');
};

export const ContainerWorkersCommand = Object.freeze({
  create(): IBaseCommand {
    return BaseCommand.create({
      name: 'cw',
      aliases: ['container-workers'],
      description: 'Build or start container-based workers',
      addOptions: (command: Command): void => {
        command.argument('<action>', 'Action to run (build or up)');
        command.option('-d, --detach', 'Run containers in background (up only)');
        command.option('--no-cache', 'Disable Docker build cache (build only)');
        command.option('--pull', 'Always attempt to pull a newer base image (build only)');
        command.option('--build', 'Build before running up (up only)');
      },
      execute: async (options: ContainerWorkersOptions): Promise<void> => {
        const action = normalizeAction(options.args?.[0]);
        const composePath = resolveComposePath(
          'docker-compose.workers.yml',
          'docker-compose.workers.yml not found. Run `zin init:cw` first.'
        );

        if (action === 'build') {
          await runBuild(composePath, options);
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
