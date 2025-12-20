/**
 * Fix Command - Automated Code Cleanup
 * Runs ESLint fix and other automated tools
 */

import { BaseCommand, CommandOptions } from '@cli/BaseCommand';
import { Logger } from '@config/logger';
import { Command } from 'commander';
import { execSync } from 'node:child_process';

export class FixCommand extends BaseCommand {
  protected name = 'fix';
  protected description = 'Run automated code fixes (ESLint, Prettier)';

  protected addOptions(command: Command): void {
    command.option('--dry-run', 'Show what would be fixed without applying changes');
  }

  public async execute(options: CommandOptions): Promise<void> {
    this.info('Starting automated code fixes...');

    try {
      const dryRun = options['dryRun'] === true ? '--dry-run' : '';

      this.info('Running ESLint fix...');
      execSync(`npx eslint src --ext .ts --fix ${dryRun}`, { stdio: 'inherit' });

      this.info('Running Prettier format...');
      execSync(`npx prettier --write "src/**/*.ts" ${dryRun}`, { stdio: 'inherit' });

      this.success('Code fixes completed successfully!');
    } catch (error) {
      Logger.error('Fix command failed', error);
      this.warn('Some fixes could not be applied automatically or linting errors remain.');
      // Don't throw here to allow the user to see the output
    }
  }
}
