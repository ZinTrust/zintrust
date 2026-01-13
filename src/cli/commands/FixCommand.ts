/**
 * Fix Command - Automated Code Cleanup
 * Runs ESLint fix and other automated tools
 */

import { appConfig } from '@/config';
import type { CommandOptions, IBaseCommand } from '@cli/BaseCommand';
import { BaseCommand } from '@cli/BaseCommand';
import { resolveNpmPath } from '@common/index';
import { ErrorFactory } from '@exceptions/ZintrustError';
import { execFileSync } from '@node-singletons/child-process';
import type { Command } from 'commander';

type IFixCommand = IBaseCommand & {
  resolveNpmPath: () => string;
  getSafeEnv: () => NodeJS.ProcessEnv;
  runNpmExec: (args: string[]) => void;
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

const executeFix = (cmd: IBaseCommand, options: CommandOptions): void => {
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

    const cmd = BaseCommand.create<IFixCommand>({
      name: 'fix',
      description: 'Run automated code fixes',
      addOptions,
      execute: (options: CommandOptions): void => executeFix(cmd, options),
    });

    cmd.resolveNpmPath = (): string => resolveNpmPath();
    cmd.getSafeEnv = (): NodeJS.ProcessEnv => appConfig.getSafeEnv();
    cmd.runNpmExec = (args: string[]): void => runNpmScript(cmd, args);

    return cmd;
  },
});
