import { BaseCommand, type IBaseCommand } from '@cli/BaseCommand';
import { Logger } from '@config/logger';
import { ErrorFactory } from '@exceptions/ZintrustError';
import fs from '@node-singletons/fs';
import path from '@node-singletons/path';
import type { Command } from 'commander';

const publishQueueMonitorConfig = async (cwd: string): Promise<void> => {
  const targetPath = path.join(cwd, 'config', 'queueMonitor.ts');

  if (fs.existsSync(targetPath)) {
    Logger.warn('Configuration file already exists: config/queueMonitor.ts');
    return;
  }

  // 1. Try resolving through node_modules (production usage)
  const nodeModulesPath = path.join(
    cwd,
    'node_modules',
    '@zintrust',
    'queue-monitor',
    'src',
    'config',
    'queueMonitor.ts'
  );

  // 2. Fallback for monorepo development (local usage)
  const monorepoPath = path.join(
    cwd,
    'packages',
    'queue-monitor',
    'src',
    'config',
    'queueMonitor.ts'
  );

  let sourcePath = '';

  if (fs.existsSync(nodeModulesPath)) {
    sourcePath = nodeModulesPath;
  } else if (fs.existsSync(monorepoPath)) {
    sourcePath = monorepoPath;
  } else {
    throw ErrorFactory.createCliError(
      `Could not locate source configuration file. Ensure @zintrust/queue-monitor is installed.`
    );
  }

  // Ensure config directory exists
  const configDir = path.dirname(targetPath);
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  fs.copyFileSync(sourcePath, targetPath);
  Logger.info('Published configuration: config/queueMonitor.ts');
};

export const PublishCommand = Object.freeze({
  create(): IBaseCommand {
    return BaseCommand.create({
      name: 'publish:config',
      description: 'Publish configuration files from packages to your project',
      aliases: ['p:config'],
      addOptions: (command: Command) => {
        command.option('--queue-monitor', 'Publish Queue Monitor configuration');
      },
      execute: async (options) => {
        const cwd = process.cwd();

        if (options['queueMonitor'] !== undefined && options['queueMonitor'] !== null) {
          await publishQueueMonitorConfig(cwd);
        } else {
          Logger.warn('Please specify a configuration to publish (e.g., --queue-monitor)');
        }
      },
    });
  },
});
