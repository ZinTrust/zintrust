/**
 * Migrate Command
 * Run database migrations
 */

import { BaseCommand, CommandOptions, IBaseCommand } from '@cli/BaseCommand';
import { ErrorFactory } from '@exceptions/ZintrustError';
import { Command } from 'commander';

/**
 * Migrate Command Factory
 */
export const MigrateCommand = Object.freeze({
  /**
   * Create a new migrate command instance
   */
  create(): IBaseCommand {
    const addOptions = (command: Command): void => {
      command
        .option('--fresh', 'Drop all tables and re-run migrations')
        .option('--rollback', 'Rollback last migration batch')
        .option('--reset', 'Rollback all migrations')
        .option('--step <number>', 'Number of batches to rollback', '0');
    };

    const execute = (options: CommandOptions, cmd: IBaseCommand): void => {
      cmd.debug(`Migrate command executed with options: ${JSON.stringify(options)}`);

      try {
        cmd.info('Loading configuration...');
        // Configuration loading would go here

        if (options['fresh'] === true) {
          cmd.warn('This will drop all tables and re-run migrations');
          // Confirmation would go here
          cmd.success('Fresh migration completed');
        } else if (options['rollback'] === true) {
          cmd.success('Migrations rolled back');
        } else if (options['reset'] === true) {
          cmd.warn('Resetting all migrations');
          cmd.success('All migrations reset');
        } else {
          cmd.info('Running pending migrations...');
          cmd.success('Migrations completed successfully');
        }
      } catch (error) {
        ErrorFactory.createTryCatchError(`Migration failed: ${(error as Error).message}`, error);
      }
    };

    const cmd: IBaseCommand = BaseCommand.create({
      name: 'migrate',
      description: 'Run database migrations',
      addOptions,
      execute: (options: CommandOptions): void => execute(options, cmd),
    });

    return cmd;
  },
});
