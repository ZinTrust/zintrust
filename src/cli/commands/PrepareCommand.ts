/**
 * Prepare Command
 * Makes the local dist/ folder installable via `file:/.../dist`.
 * Usage: zintrust prepare
 */

import type { IBaseCommand } from '@cli/BaseCommand';
import { materializeWranglerDevVars } from '@cli/cloudflare/CloudflareWranglerDevEnv';
import { DistPackager } from '@cli/utils/DistPackager';
import { SpawnUtil } from '@cli/utils/spawn';
import { resolveNpmPath } from '@common/index';
import { Logger } from '@config/logger';
import { ErrorFactory } from '@exceptions/ZintrustError';
import * as path from '@node-singletons/path';
import chalk from 'chalk';
import { Command } from 'commander';

type PrepareOptions = {
  dist?: string;
  link?: boolean;
  devVars?: boolean | string;
  envPath?: string;
  target?: string;
  config?: string;
};

const resolveDistPath = (options: PrepareOptions): string => {
  const distRel =
    typeof options.dist === 'string' && options.dist.trim() !== '' ? options.dist : 'dist';

  return path.resolve(process.cwd(), distRel);
};

const logPreparedDist = (): void => {
  Logger.info(chalk.green('✅ Dist prepared.'));
  Logger.info('Docs roots:');
  Logger.info(`- Production/new apps: ${chalk.cyan('dist/public')}`);
  Logger.info(`- Framework dev:      ${chalk.cyan('docs-website/public')}`);
};

const prepareWranglerDevVars = async (options: PrepareOptions): Promise<void> => {
  if (options.devVars === undefined) return;

  const wranglerEnv = typeof options.devVars === 'string' ? options.devVars.trim() : '';
  const result = await materializeWranglerDevVars({
    cwd: process.cwd(),
    projectRoot: process.cwd(),
    ...(wranglerEnv === '' ? {} : { envName: wranglerEnv }),
    ...(typeof options.envPath === 'string' ? { envPath: options.envPath } : {}),
    ...(typeof options.target === 'string' ? { target: options.target } : {}),
    ...(typeof options.config === 'string' ? { configPath: options.config } : {}),
    requireSelection: true,
  });

  Logger.info(chalk.green(`✅ Wrangler dev vars prepared at ${path.basename(result.filePath)}.`));
  Logger.info(`Selected keys: ${result.selectedKeys.length}`);

  if (result.missingKeys.length > 0) {
    Logger.info(`Missing keys: ${result.missingKeys.join(', ')}`);
  }
};

const maybeLinkCli = async (options: PrepareOptions): Promise<void> => {
  if (options.link !== true) return;

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
};

const executePrepare = async (options: PrepareOptions): Promise<void> => {
  DistPackager.prepare(resolveDistPath(options), process.cwd());
  logPreparedDist();
  await prepareWranglerDevVars(options);
  await maybeLinkCli(options);
};

export const PrepareCommand = {
  name: 'prepare',
  description: 'Prepare local dist/ for file: installs (simulate/fresh install workflow)',

  getCommand(): Command {
    return new Command('prepare')
      .description('Prepare local dist/ so it can be installed via file:/.../dist')
      .option('--dist <path>', 'Dist folder path (default: ./dist)')
      .option(
        '--dev-vars [env]',
        'Generate Wrangler .dev.vars or .dev.vars.<env> from .zintrust.json cloudflare env groups'
      )
      .option(
        '--env-path <path>',
        'Env file used as source values for generated Wrangler dev vars',
        '.env'
      )
      .option(
        '--target <id>',
        'Cloudflare worker target key from .zintrust.json cloudflare.targets'
      )
      .option('-c, --config <path>', 'Wrangler config file used for target inference (optional)')
      .option('--link', 'Also run `npm link` to expose zintrust/zin/z/zt on PATH (dev-only)')
      .action(async (options: PrepareOptions) => {
        try {
          await executePrepare(options);
        } catch (error) {
          Logger.error('Failed to prepare dist', error);
          throw ErrorFactory.createCliError('Prepare failed', error);
        }
      });
  },
} as IBaseCommand;
