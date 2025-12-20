/**
 * Base Command - Abstract Command Class
 * All CLI commands extend this class
 */

import { ErrorHandler } from '@cli/ErrorHandler';
import { Logger } from '@config/logger';
import { Command } from 'commander';

export interface CommandOptions {
  verbose?: boolean;
  args?: string[];
  [key: string]: unknown;
}

export abstract class BaseCommand {
  protected name: string = '';
  protected description: string = '';
  protected verbose: boolean = false;

  /**
   * Get command instance
   */
  public getCommand(): Command {
    const command = new Command(this.name);
    command.description(this.description);
    command.option('-v, --verbose', 'Enable verbose output');

    // Add custom options (override in subclass)
    this.addOptions(command);

    // Set action handler
    command.action(async (...args: unknown[]) => {
      // Commander passes arguments first, then options, then command
      const options = args.at(-2) as CommandOptions;

      // Extract arguments (everything before options)
      const commandArgs = args.slice(0, -2) as string[];
      options.args = commandArgs;

      this.verbose = options.verbose === true;

      try {
        await this.execute(options);
      } catch (error) {
        Logger.error('Command execution failed', error);
        ErrorHandler.handle(error as Error);
      }
    });

    return command;
  }

  /**
   * Add command-specific options (override in subclass)
   */
  protected addOptions(_command: Command): void {
    // Override in subclass to add specific options
  }

  /**
   * Execute command logic (must implement in subclass)
   */
  abstract execute(options: CommandOptions): Promise<void>;

  /**
   * Log debug message (respects verbose flag)
   */
  protected debug(message: string): void {
    ErrorHandler.debug(message, this.verbose);
  }

  /**
   * Log info message
   */
  protected info(message: string): void {
    ErrorHandler.info(message);
  }

  /**
   * Log success message
   */
  protected success(message: string): void {
    ErrorHandler.success(message);
  }

  /**
   * Log warning message
   */
  protected warn(message: string): void {
    ErrorHandler.warn(message);
  }
}
