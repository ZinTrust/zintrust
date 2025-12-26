/**
 * Fix Command - Automated Code Cleanup
 * Runs ESLint fix and other automated tools
 */

import { appConfig } from '@/config';
import { BaseCommand, CommandOptions, IBaseCommand } from '@cli/BaseCommand';
import { ErrorFactory } from '@exceptions/ZintrustError';
import { execFileSync } from '@node-singletons/child-process';
import fs from '@node-singletons/fs';
import * as path from '@node-singletons/path';
import { Command } from 'commander';

type IFixCommand = IBaseCommand & {
  resolveNpmPath: () => string;
  getSafeEnv: () => NodeJS.ProcessEnv;
  runNpmExec: (args: string[]) => void;
};

const resolveNpmPath = (): string => {
  const nodeBinDir = path.dirname(process.execPath);

  const candidates =
    process.platform === 'win32'
      ? [path.join(nodeBinDir, 'npm.cmd'), path.join(nodeBinDir, 'npm.exe')]
      : [path.join(nodeBinDir, 'npm')];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  throw ErrorFactory.createCliError(
    'Unable to locate npm executable. Ensure Node.js (with npm) is installed in the standard location.'
  );
};

const runNpmScript = (cmd: IBaseCommand, args: string[]): void => {
  const npmPath = resolveNpmPath();
  cmd.debug(`Executing: npm run ${args.join(' ')}`);
  execFileSync(npmPath, ['run', ...args], {
    stdio: 'inherit',
    encoding: 'utf8',
    env: appConfig.getSafeEnv(),
  });
};

const executeFix = async (cmd: IBaseCommand, options: CommandOptions): Promise<void> => {
  cmd.info('Starting automated code fixes...');

  try {
    const isDryRun = options['dryRun'] === true;

    cmd.info('Running ESLint fix...');
    try {
      runNpmScript(cmd, ['lint', '--', isDryRun ? '--fix-dry-run' : '--fix']);
    } catch (error) {
      ErrorFactory.createCliError('ESLint fix failed', error);
      cmd.warn('ESLint fix encountered some issues, continuing...');
    }

    cmd.info('Running Prettier format...');
    try {
      runNpmScript(cmd, ['format']);
    } catch (error) {
      ErrorFactory.createCliError('Prettier format failed', error);
      cmd.warn('Prettier format encountered some issues.');
    }

    cmd.success('Code fixes completed successfully!');
  } catch (error) {
    ErrorFactory.createCliError('Fix command failed', error);
    cmd.warn('Some fixes could not be applied automatically.');
  }

  return Promise.resolve();
};

/**
 * Fix Command Factory
 */
export const FixCommand = Object.freeze({
  /**
   * Create a new fix command instance
   */
  create(): IBaseCommand {
    const addOptions = (command: Command): void => {
      command.option('--dry-run', 'Show what would be fixed without applying changes');
    };

    const cmd = BaseCommand.create({
      name: 'fix',
      description: 'Run automated code fixes',
      addOptions,
      execute: async (options: CommandOptions): Promise<void> => executeFix(cmd, options),
    }) as IFixCommand;

    cmd.resolveNpmPath = (): string => resolveNpmPath();
    cmd.getSafeEnv = (): NodeJS.ProcessEnv => appConfig.getSafeEnv();
    cmd.runNpmExec = (args: string[]): void => runNpmScript(cmd, args);

    return cmd;
  },
});
