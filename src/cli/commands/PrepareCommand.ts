/**
 * Prepare Command
 * Makes the local dist/ folder installable via `file:/.../dist`.
 * Usage: zintrust prepare
 */

import { resolveNpmPath } from '@/common';
import { IBaseCommand } from '@cli/BaseCommand';
import { DistPackager } from '@cli/utils/DistPackager';
import { SpawnUtil } from '@cli/utils/spawn';
import { Logger } from '@config/logger';
import { ErrorFactory } from '@exceptions/ZintrustError';
import * as path from '@node-singletons/path';
import chalk from 'chalk';
import { Command } from 'commander';

type PrepareOptions = {
  dist?: string;
  link?: boolean;
};

export const PrepareCommand = {
  name: 'prepare',
  description: 'Prepare local dist/ for file: installs (simulate/fresh install workflow)',

  getCommand(): Command {
    return new Command('prepare')
      .description('Prepare local dist/ so it can be installed via file:/.../dist')
      .option('--dist <path>', 'Dist folder path (default: ./dist)')
      .option('--link', 'Also run `npm link` to expose zintrust/zin/z/zt on PATH (dev-only)')
      .action(async (options: PrepareOptions) => {
        try {
          const distRel =
            typeof options.dist === 'string' && options.dist.trim() !== '' ? options.dist : 'dist';
          const distPath = path.resolve(process.cwd(), distRel);

          DistPackager.prepare(distPath, process.cwd());

          Logger.info(chalk.green('✅ Dist prepared.'));
          Logger.info('Docs roots:');
          Logger.info(`- Production/new apps: ${chalk.cyan('dist/public')}`);
          Logger.info(`- Framework dev:      ${chalk.cyan('docs-website/public')}`);

          if (options.link === true) {
            Logger.info(chalk.bold('\nLinking CLI globally (npm link)...'));
            const npm = resolveNpmPath();
            const exitCode = await SpawnUtil.spawnAndWait({
              command: npm,
              args: ['link'],
              cwd: process.cwd(),
            });

            if (exitCode !== 0) {
              throw ErrorFactory.createCliError(`npm link exited with code ${exitCode}`);
            }

            Logger.info(chalk.green('✅ Linked. You can now run `zintrust` from your shell.'));
          }
        } catch (error) {
          Logger.error('Failed to prepare dist', error);
          throw ErrorFactory.createCliError('Prepare failed', error);
        }
      });
  },
} as IBaseCommand;
